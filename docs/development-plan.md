# 私有参考库服务开发计划

## 1. 目标

在 `luban-private-knowledge` 中实现一个面向个人私有知识的参考库服务，提供参考库管理、Markdown 文档上传、异步索引、语义检索和完整文档召回能力。

本服务复用既有 API 契约中的“参考库”语义，但第一阶段约束与 [LuBan 的知识库与参考库 API 契约](../LuBan/docs/knowledge-reference-api-contract.md) 不同：

- 不是广场模型，而是个人私有知识模型。
- 每个参考库、文档、向量数据都按 `owner_user_id` 隔离。
- 原文存储使用 Supabase Storage bucket `private-reference-documents`。
- 向量层使用新表 + `pgvector`，不复用现有公开知识向量资源。
- 业务表与向量表统一放在 Supabase `public` schema，确保可通过现有 API 暴露。

## 2. 范围

第一阶段只做参考库，不做知识库切片检索。

### 2.1 包含范围

- 参考库 CRUD
- 参考库文档列表 / 详情 / 删除
- Markdown 文档上传
- Markdown 原文存储到 Supabase Storage
- 文档摘要生成
- 基于 summary 的 embedding 生成
- 向量写入 `pgvector` 新表
- 查询时只召回最相关的一篇文档
- 按文档 ID 返回完整 Markdown 内容
- 面向个人私有数据的 RLS

### 2.2 暂不包含

- 多租户团队共享
- 文档内容在线更新
- 文档切片级检索
- 重排序模型
- 混合检索（全文 + 向量）
- 批量导入、目录同步、文件夹上传
- 文档版本管理

## 3. 技术路线

服务风格对齐 LuBan 当前 Node/Bun/Hono 体系。

### 3.1 建议技术栈

- Runtime: Bun
- HTTP framework: Hono
- Validation: Zod
- Supabase access:
  - Auth 用户态校验：Supabase JWT
  - Storage：`@supabase/supabase-js`
  - Database：Supabase Postgres
- Embedding storage: `pgvector`
- Async jobs:
  - 第一阶段可先用应用内异步任务 + 状态表
  - 若后续需要更稳的重试和并发控制，再引入正式队列

### 3.2 模块划分

建议按以下分层实现：

- `src/app`：Hono 入口、路由注册、中间件
- `src/modules/reference-libraries`：参考库空间管理
- `src/modules/reference-documents`：文档上传、查询、删除、内容召回
- `src/modules/indexing`：摘要、embedding、索引状态流转
- `src/modules/search`：query embedding、相似度检索、response 组织
- `src/modules/storage`：Storage key 生成、上传、删除、读取
- `src/modules/auth`：用户身份解析
- `src/lib/supabase`：Supabase client 与环境变量封装

## 4. 数据模型

数据库与存储必须严格围绕“个人私有知识”建模。

### 4.1 Storage 规划

- bucket: `private-reference-documents`
- object key: `{ownerUserId}/{referenceLibraryId}/{documentId}.md`

这样做的好处：

- 天然按用户隔离
- 删除参考库或文档时容易定位对象
- 后续做迁移、审计、计数更方便

### 4.2 Schema 与表设计

数据库对象统一放在 Supabase schema `public`。

建议在 SQL 中优先使用全名，例如 `public.private_reference_libraries`，这样迁移和 RPC 定义更清晰，也能与当前 Supabase REST 暴露方式保持一致。

#### `public.private_reference_libraries`

字段建议：

- `id uuid primary key`
- `owner_user_id uuid not null`
- `name text not null`
- `description text null`
- `status text not null default 'ready'`
- `document_count integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

约束与索引：

- `check (status in ('ready', 'indexing', 'failed'))`
- `unique (owner_user_id, name)`
- index on `(owner_user_id, updated_at desc)`

#### `public.private_reference_documents`

字段建议：

- `id uuid primary key`
- `reference_library_id uuid not null references public.private_reference_libraries(id) on delete cascade`
- `owner_user_id uuid not null`
- `title text not null`
- `storage_bucket text not null`
- `storage_path text not null`
- `content_size integer not null`
- `content_sha256 text not null`
- `summary text null`
- `index_status text not null default 'pending'`
- `index_error text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

约束与索引：

- `check (index_status in ('pending', 'indexing', 'ready', 'failed'))`
- `unique (reference_library_id, id)`
- index on `(owner_user_id, reference_library_id, created_at desc)`
- index on `(owner_user_id, index_status)`

#### `public.private_reference_document_embeddings`

字段建议：

- `id uuid primary key`
- `document_id uuid not null references public.private_reference_documents(id) on delete cascade`
- `owner_user_id uuid not null`
- `summary_text text not null`
- `embedding vector(4096) not null`
- `embedding_model text not null`
- `created_at timestamptz not null default now()`

约束与索引：

- `unique (document_id)`
- index on `(owner_user_id, document_id)`
- 向量索引按选定距离函数建立 `ivfflat` 或 `hnsw`

#### 可选：`public.private_reference_queries`

若需要保留查询日志，可增加：

- `id uuid primary key`
- `owner_user_id uuid not null`
- `reference_library_id uuid not null`
- `query text not null`
- `matched_document_id uuid null`
- `created_at timestamptz not null default now()`

第一阶段可以不做，或只做轻量日志。

## 5. RLS 与安全边界

这是本服务与公开知识方案的核心区别。

### 5.1 RLS 原则

所有私有知识表都开启 RLS，所有查询都按 `owner_user_id = auth.uid()` 约束。

- `select`：只能读自己的库、文档、embedding
- `insert`：只能插入 `owner_user_id = auth.uid()` 的记录
- `update`：只能修改自己的记录，并用 `using` + `with check` 双重约束
- `delete`：只能删除自己的记录

### 5.2 Storage 策略

Storage 也必须按用户隔离，至少满足：

- 上传对象路径必须落在自己的前缀下
- 读取对象只能读取自己的前缀
- 删除对象只能删除自己的前缀

建议把存储路径规范固化在服务端，不接受前端自定义 path。

### 5.3 服务端权限策略

- 用户态请求使用 Bearer token
- 服务端先校验用户身份，再执行业务逻辑
- 不在前端暴露 `service_role`
- 不把公开知识表和私有知识表混查

## 6. API 设计落地

优先复用既有参考库 API 形状，但将“广场可见”改为“仅当前用户可见”。

### 6.1 参考库接口

保留以下接口语义：

- `GET /api/reference-libraries`
- `POST /api/reference-libraries`
- `GET /api/reference-libraries/{referenceLibraryId}`
- `PATCH /api/reference-libraries/{referenceLibraryId}`
- `DELETE /api/reference-libraries/{referenceLibraryId}`

差异：

- 列表只返回当前用户的参考库
- `name` 唯一性从“全局唯一”改为“同一用户下唯一”
- 所有资源访问都隐含当前用户范围

### 6.2 文档接口

保留以下接口语义：

- `GET /api/reference-libraries/{referenceLibraryId}/documents`
- `POST /api/reference-libraries/{referenceLibraryId}/documents`
- `GET /api/reference-libraries/{referenceLibraryId}/documents/{documentId}`
- `DELETE /api/reference-libraries/{referenceLibraryId}/documents/{documentId}`
- `GET /api/reference-libraries/{referenceLibraryId}/documents/{documentId}/content`

约束：

- 只接受 Markdown 文本，不接收 Word/PDF
- 第一阶段不支持文档 PATCH 更新
- 大文件按配置直接拒绝

### 6.3 搜索接口

保留：

- `POST /api/reference-libraries/{referenceLibraryId}/search`

行为定义：

- 服务端先对 query 生成 embedding
- 在当前用户、当前参考库范围内进行向量搜索
- 只取最相关的一篇文档
- 读取该文档 Markdown 全文
- 组织 `response` 并返回命中文档元信息

建议返回结构继续沿用契约：

```json
{
  "response": "...",
  "document": {
    "documentId": "...",
    "title": "..."
  }
}
```

## 7. 索引流程

### 7.1 文档创建流程

1. 校验用户身份
2. 校验参考库归属
3. 校验 `title` 与 `markdown`
4. 校验 Markdown 大小上限
5. 生成 `documentId`
6. 上传原文到 `private-reference-documents`
7. 写入 `public.private_reference_documents`，状态为 `pending`
8. 启动异步索引任务
9. 返回 `indexStatus = indexing` 或 `pending`

### 7.2 异步索引流程

1. 将文档状态更新为 `indexing`
2. 读取 Markdown 原文
3. 生成 summary
4. 对 summary 生成 embedding
5. 写入 / upsert `public.private_reference_document_embeddings`
6. 更新文档 `summary`
7. 将状态更新为 `ready`
8. 失败时将状态更新为 `failed` 并记录 `index_error`

### 7.3 删除流程

删除文档时需要保证三处数据一致：

- 删除 Storage 对象
- 删除文档元数据
- 删除 embedding 记录

删除参考库时依赖：

- 文档表 `on delete cascade`
- embedding 表 `on delete cascade`
- Storage 对象需由服务端显式清理

## 8. 检索设计

### 8.1 检索策略

第一阶段只做“summary 级文档召回”，不做 chunk 检索。

优点：

- 结构简单
- 更贴近参考库“召回完整文档”的目标
- 嵌入条数少，成本可控

局限：

- 对超长文档的细粒度命中能力较弱
- 如果 summary 质量差，召回质量会受影响

### 8.2 查询逻辑

建议数据库侧封装一个私有 RPC 或在应用层执行参数化 SQL：

- 输入：`owner_user_id`、`reference_library_id`、`query_embedding vector(4096)`
- 过滤：仅当前用户、当前参考库、`index_status = 'ready'`
- 排序：向量距离升序
- 返回：最佳匹配文档 ID 与分数
- 当前实现已验证使用 `hnsw` 索引和 `match_private_reference_document` RPC

后续如果需要增强，可以增加：

- 最低分阈值
- fallback 到标题 / trigram / full-text search
- 混合召回

但第一阶段先不要加复杂度。

## 9. 项目结构建议

建议初始化为：

```text
src/
  app/
    routes/
    middleware/
  modules/
    reference-libraries/
      routes.ts
      service.ts
      repository.ts
      schema.ts
    reference-documents/
      routes.ts
      service.ts
      repository.ts
      schema.ts
    search/
      service.ts
      repository.ts
    indexing/
      service.ts
    storage/
      service.ts
    auth/
      service.ts
  lib/
    env.ts
    supabase.ts
    errors.ts
    response.ts
  db/
    sql/
```

## 10. 实施顺序

### Phase 1：项目骨架

- 初始化 Bun + Hono 项目
- 增加环境变量管理
- 接入认证中间件
- 统一错误响应结构

### Phase 2：数据库与存储基础设施

- 创建私有参考库相关表
- 启用 `pgvector`
- 建立索引与 RLS
- 配置 `private-reference-documents` bucket 策略

### Phase 3：参考库 CRUD

- 完成参考库列表、创建、详情、更新、删除
- 严格按当前用户过滤

### Phase 4：文档上传与召回

- 完成文档创建、列表、详情、删除、content 获取
- 完成 Markdown 上传到 Storage
- 完成元数据入库

### Phase 5：异步索引与向量检索

- 接入 summary 生成
- 接入 embedding 生成
- 建立向量检索逻辑
- 完成 `/search`

### Phase 6：验证与加固

- 验证 RLS
- 验证 Storage policy
- 验证删除一致性
- 验证大文件拒绝与错误响应

## 11. 关键风险

### 11.1 Summary 质量决定召回质量

因为第一阶段以 summary embedding 作为召回基础，summary 如果过短、过泛或不稳定，会直接影响搜索结果。

应对：

- 固定 summary 生成模板
- 控制 summary 长度和信息密度
- 保留后续升级到 chunk 或 hybrid search 的空间

### 11.2 异步索引一致性

Storage 上传成功但 embedding 失败时，会出现“文档存在但不可检索”的中间态。

应对：

- 明确 `pending/indexing/failed/ready` 状态流转
- 在文档列表和详情中暴露 `indexStatus`
- 支持后台重试

### 11.3 删除一致性

数据库删除与 Storage 删除不是同一个事务。

应对：

- 删除时先删 Storage，再删数据库
- 或记录待清理任务，避免遗留孤儿对象

## 12. 验收标准

第一阶段完成后，应满足：

- 用户只能看到和操作自己的参考库与文档
- Markdown 可以成功写入 `private-reference-documents`
- 文档上传后可进入 `indexing -> ready`
- `/search` 能返回当前库中最相关的一篇文档
- `/content` 能返回完整 Markdown
- 删除文档后，Storage 对象、元数据、embedding 都被清理
- 不依赖公开知识库现有 schema、向量表或检索 RPC

## 13. 真实环境测试用例与执行结果

### 13.1 测试范围

已使用真实环境完成以下验证：

- 真实 Supabase 用户登录
- 真实数据库 CRUD
- 真实 Supabase Storage 上传、下载、删除
- 真实 embedding API 调用
- 真实 HTTP API 端到端导入、索引、召回
- 测试数据清理与重复执行能力

### 13.2 测试文档

固定测试文档位于：

- `tests/fixtures/ai-llm.md`
- `tests/fixtures/web3.md`
- `tests/fixtures/manufacturing.md`

测试查询按领域区分：

- AI 大模型：`RAG`、`MoE`、`embedding`、`上下文窗口`
- Web3：`钱包`、`智能合约`、`Layer2`、`Gas`、`EVM`
- 机械制造：`BOM`、`MES`、`数控机床`、`公差`、`工艺路线`

### 13.3 执行命令

使用以下命令执行验证：

- `bun run check:supabase-runtime`
- `bun run check:supabase-storage`
- `bun run check:embedding`
- `bun run test:real-http-e2e`

### 13.4 已验证结果

已验证通过的行为包括：

- 能创建私有 reference library
- 能上传 3 份 Markdown 文档并写入 Storage
- 能通过文档 content 接口读回完整 Markdown
- 文档索引状态能从创建态进入 `ready`
- `private_reference_document_embeddings` 中能查到 3 条 embedding 记录
- 3 组领域查询都能召回各自正确文档
- 测试结束后会自动删除文档与参考库，避免脏数据残留

### 13.5 当前运行时约束

本次真实验证确认：

- 当前 embedding 模型返回维度为 `4096`
- 数据库向量列与检索 RPC 参数都应与 `4096` 维保持一致
- 真实测试依赖 `.env` 中的 Supabase、Storage、embedding 与测试账号配置

## 14. 后续可扩展方向

- 文档 chunk 级召回
- 混合检索（向量 + 全文）
- 个人知识与团队知识双层权限模型
- 重建索引接口
- 批量导入与目录同步
- 文档版本历史
