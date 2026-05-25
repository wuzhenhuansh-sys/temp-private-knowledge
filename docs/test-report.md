# 私有参考库真实环境测试报告

## 1. 测试目标

验证私有参考库服务在真实环境下的完整业务链路，确保以下流程可用：

- 真实 Supabase 用户认证
- 参考库创建与查询
- Markdown 文档上传
- 原文写入 Supabase Storage
- 文档索引状态流转
- embedding 生成与向量落库
- 基于向量的文档召回
- 测试数据自动清理

## 2. 测试环境

### 2.1 运行时

- Runtime: Bun
- HTTP framework: Hono
- Database: Supabase Postgres
- Object Storage: Supabase Storage
- Vector Search: pgvector
- Embedding API: 外部真实 embedding 服务

### 2.2 关键配置

本次测试基于项目 `.env` 中的真实配置执行，包括：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PRIVATE_REFERENCE_BUCKET`
- `EMBEDDING_MODEL`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `SUPABASE_TEST_EMAIL` / `SUPABASE_TEST_PASSWORD`

### 2.3 测试文档

使用以下固定 Markdown 文档作为测试输入：

- `tests/fixtures/ai-llm.md`
- `tests/fixtures/web3.md`
- `tests/fixtures/manufacturing.md`

## 3. 执行步骤

按以下顺序执行验证：

```bash
bun run check:supabase-runtime
bun run check:supabase-storage
bun run check:embedding
bun run test:real-http-e2e
```

## 4. 测试覆盖范围

### 4.1 运行时与基础设施检查

`check:supabase-runtime` 覆盖：

- 测试用户登录
- 参考库创建、查询、更新、删除
- Storage 上传与下载
- 文档元数据写入、查询、更新、删除

`check:supabase-storage` 覆盖：

- Storage 对象上传
- Storage 对象下载
- Storage 对象删除

`check:embedding` 覆盖：

- embedding 接口可达性
- 模型返回结构兼容性
- embedding 向量维度检查

### 4.2 真实 HTTP API 端到端检查

`test:real-http-e2e` 覆盖：

- 本地 API 服务启动
- 通过真实 Bearer Token 调用 HTTP API
- 创建 reference library
- 上传 3 篇不同领域 Markdown
- 校验 `/content` 返回原文
- 校验 Storage 中对象内容一致
- 等待文档进入 `ready`
- 校验 `private_reference_document_embeddings` 中存在对应向量记录
- 用 3 组领域查询验证召回结果
- 删除文档和 reference library，避免残留脏数据

## 5. 实际执行结果

### 5.1 Supabase 运行时检查

结果：通过

验证结论：

- 数据库 CRUD 正常
- 参考库与文档元数据写入正常
- Storage 联动正常
- 当前运行时认证配置可用

### 5.2 Storage 检查

结果：通过

验证结论：

- 上传成功
- 下载成功且内容一致
- 删除成功

### 5.3 Embedding 检查

结果：通过

验证结论：

- `EMBEDDING_BASE_URL` 可达
- 当前模型 `qwen3-embedding:8b` 可正常返回 embedding
- 本次真实返回维度为 `4096`

### 5.4 真实 HTTP API 端到端检查

结果：通过

验证结论：

- 成功创建 reference library
- 成功导入 AI / Web3 / 机械制造 3 篇文档
- 文档原文成功写入 Storage
- 所有文档都进入 `ready` 状态
- embedding 记录成功落库
- 3 个领域查询都召回了对应正确文档
- 测试结束后已自动清理 reference library 和 documents

## 6. 关键结论

本次测试确认：

- 私有参考库主链路在真实环境下可以工作
- 文档导入、原文存储、向量化、召回已经完整打通
- 当前 embedding 返回维度与仓库 SQL 一致，应保持 `4096`
- 新增的真实 E2E 脚本可作为后续回归验证入口

## 7. 已识别并处理的问题

### 7.1 文档创建失败时的计数回滚问题

问题：

- 文档创建过程中先增加 `document_count`
- 若后续索引失败，原实现只回滚 Storage 和文档记录，不回滚 reference library 计数

处理：

- 已在 `src/modules/reference-documents/service.ts` 中补上失败路径下的 `document_count` 回滚

## 8. 关联文件

- `tests/real-http-e2e.ts`
- `tests/fixtures/ai-llm.md`
- `tests/fixtures/web3.md`
- `tests/fixtures/manufacturing.md`
- `src/modules/reference-documents/service.ts`
- `package.json`
- `.env.example`
- `docs/development-plan.md`

## 9. 后续建议

- 将 `bun run test:real-http-e2e` 作为后续改动后的回归验证入口
- 若后续更换 embedding 模型，优先检查返回维度是否仍与数据库 schema 一致
- 若后续引入 chunk 检索，可在当前报告基础上继续扩展更细粒度测试用例
