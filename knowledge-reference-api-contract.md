# Private Knowledge API 文档

> 说明：本文档仅基于 `src/` 目录内代码整理，不参考仓库其他目录。

## 概览

- 服务框架：Hono
- 服务入口：`src/index.ts`
- 应用装配：`src/app/index.ts`
- API 基础前缀：`/api`
- 健康检查：`/health`
- 消费者鉴权：第一阶段不要求调用方提供鉴权信息
- 服务侧鉴权：服务内部使用 `.env` 中固定的 `SUPABASE_USER_EMAIL` / `SUPABASE_USER_PASSWORD` 登录 Supabase，并用该登录态访问数据库与 Storage

## 调用方式

### Header

当前阶段，调用这些 API 不需要携带 `Authorization` header。

可直接发起请求，例如：

```http
GET /api/reference-libraries HTTP/1.1
Host: <your-host>
```

### 说明

- 调用方不需要先登录 Supabase
- 调用方不需要透传 Supabase access token
- 服务会在内部完成 Supabase 登录与后续数据访问
- 因此，当前阶段不会因为缺少 Bearer token 返回 `401`

### 服务侧前提

服务启动和运行依赖以下环境变量：

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_USER_EMAIL=...
SUPABASE_USER_PASSWORD=...
```

如果服务端固定账号登录 Supabase 失败，请求会落入统一错误处理并返回 `500 internal_error`。

## 统一错误响应

接口错误统一返回：

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

说明：`details` 为可选字段，通常用于参数校验错误等场景。

---

## 1. 健康检查

### GET `/health`

用于服务存活检测。

#### 响应示例

状态码：`200`

```json
{
  "status": "ok"
}
```

---

## 2. Reference Libraries

### 2.1 获取知识库列表

### GET `/api/reference-libraries`

返回当前服务账号可访问的知识库列表。

#### 响应示例

状态码：`200`

```json
{
  "referenceLibraries": [
    {
      "id": "uuid",
      "name": "制造业知识库",
      "description": "行业资料",
      "documentCount": 2,
      "status": "ready",
      "createdAt": "2026-05-25T10:00:00.000Z",
      "updatedAt": "2026-05-25T10:00:00.000Z"
    }
  ]
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 知识库 ID |
| name | string | 知识库名称 |
| description | string \| null | 知识库描述 |
| documentCount | number | 文档数量 |
| status | string | 知识库状态 |
| createdAt | string \| undefined | 创建时间 |
| updatedAt | string \| undefined | 更新时间 |

### 2.2 创建知识库

### POST `/api/reference-libraries`

#### 请求体

```json
{
  "name": "制造业知识库",
  "description": "行业资料"
}
```

#### 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| name | string | 是 | 去除首尾空白后不能为空 |
| description | string | 否 | 去除首尾空白后不能为空 |

#### 成功响应

状态码：`201`

```json
{
  "referenceLibrary": {
    "id": "uuid",
    "name": "制造业知识库",
    "description": "行业资料",
    "documentCount": 0,
    "status": "ready",
    "createdAt": "2026-05-25T10:00:00.000Z",
    "updatedAt": "2026-05-25T10:00:00.000Z"
  }
}
```

#### 失败响应

- `400 invalid_request`：请求体不合法
- `409 name_conflict`：知识库名称冲突

参数错误示例：

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid reference library payload.",
    "details": {
      "issues": []
    }
  }
}
```

### 2.3 获取知识库详情

### GET `/api/reference-libraries/:referenceLibraryId`

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |

#### 成功响应

状态码：`200`

```json
{
  "referenceLibrary": {
    "id": "uuid",
    "name": "制造业知识库",
    "description": "行业资料",
    "documentCount": 2,
    "status": "ready",
    "createdAt": "2026-05-25T10:00:00.000Z",
    "updatedAt": "2026-05-25T10:00:00.000Z"
  }
}
```

#### 失败响应

- `404 not_found`：知识库不存在

### 2.4 更新知识库

### PATCH `/api/reference-libraries/:referenceLibraryId`

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |

#### 请求体

至少传一个字段：

```json
{
  "name": "新的知识库名称",
  "description": "新的描述"
}
```

#### 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| name | string | 否 | 去除首尾空白后不能为空 |
| description | string | 否 | 去除首尾空白后不能为空 |

#### 成功响应

状态码：`200`

```json
{
  "referenceLibrary": {
    "id": "uuid",
    "name": "新的知识库名称",
    "description": "新的描述",
    "documentCount": 2,
    "status": "ready",
    "createdAt": "2026-05-25T10:00:00.000Z",
    "updatedAt": "2026-05-25T10:00:00.000Z"
  }
}
```

#### 失败响应

- `400 invalid_request`：请求体为空或字段不合法
- `404 not_found`：知识库不存在
- `409 name_conflict`：知识库名称冲突

### 2.5 删除知识库

### DELETE `/api/reference-libraries/:referenceLibraryId`

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |

#### 成功响应

状态码：`200`

```json
{
  "deleted": true,
  "referenceLibraryId": "uuid"
}
```

说明：代码中该接口未显式在知识库不存在时返回 `404`，是否报错取决于底层数据层行为。

---

## 3. Reference Documents

### 3.1 获取知识库文档列表

### GET `/api/reference-libraries/:referenceLibraryId/documents`

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |

#### 成功响应

状态码：`200`

```json
{
  "documents": [
    {
      "id": "uuid",
      "referenceLibraryId": "uuid",
      "title": "设备说明书",
      "contentSize": 2048,
      "indexStatus": "ready",
      "indexError": null,
      "createdAt": "2026-05-25T10:00:00.000Z",
      "updatedAt": "2026-05-25T10:00:00.000Z"
    }
  ]
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 文档 ID |
| referenceLibraryId | string | 所属知识库 ID |
| title | string | 文档标题 |
| contentSize | number | Markdown 内容字节数 |
| indexStatus | string | 索引状态，代码中可见值包括 `indexing`、`pending`、`ready`、`failed` |
| indexError | string \| null | 索引错误信息 |
| createdAt | string \| undefined | 创建时间 |
| updatedAt | string \| undefined | 更新时间 |

#### 失败响应

- `404 not_found`：知识库不存在

### 3.2 创建文档

### POST `/api/reference-libraries/:referenceLibraryId/documents`

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |

#### 请求体

```json
{
  "title": "设备说明书",
  "markdown": "# 文档内容"
}
```

#### 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| title | string | 是 | 去除首尾空白后不能为空 |
| markdown | string | 是 | 不能为空 |

#### 成功响应

状态码：`201`

```json
{
  "document": {
    "id": "uuid",
    "referenceLibraryId": "uuid",
    "title": "设备说明书",
    "contentSize": 2048,
    "indexStatus": "ready",
    "indexError": null,
    "createdAt": "2026-05-25T10:00:00.000Z",
    "updatedAt": "2026-05-25T10:00:00.000Z"
  }
}
```

说明：创建后会触发摘要与向量索引流程，最终状态可能经历 `indexing`、`pending`、`ready` 或 `failed`。由于服务层会在创建结束前刷新一次记录，返回时通常会带上最新索引状态。

#### 失败响应

- `400 invalid_request`：请求体不合法
- `404 not_found`：知识库不存在
- `413 content_too_large`：Markdown 内容超限

超限错误示例：

```json
{
  "error": {
    "code": "content_too_large",
    "message": "Markdown content is too large.",
    "details": {
      "maxBytes": 123456
    }
  }
}
```

### 3.3 获取文档摘要信息

### GET `/api/reference-libraries/:referenceLibraryId/documents/:documentId`

返回文档元信息，不返回 Markdown 正文。

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |
| documentId | string | 文档 ID |

#### 成功响应

状态码：`200`

```json
{
  "document": {
    "id": "uuid",
    "referenceLibraryId": "uuid",
    "title": "设备说明书",
    "contentSize": 2048,
    "indexStatus": "ready",
    "indexError": null,
    "createdAt": "2026-05-25T10:00:00.000Z",
    "updatedAt": "2026-05-25T10:00:00.000Z"
  }
}
```

#### 失败响应

- `404 not_found`：文档不存在

### 3.4 获取文档正文

### GET `/api/reference-libraries/:referenceLibraryId/documents/:documentId/content`

返回包含 Markdown 正文的文档内容。

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |
| documentId | string | 文档 ID |

#### 成功响应

状态码：`200`

```json
{
  "document": {
    "id": "uuid",
    "referenceLibraryId": "uuid",
    "title": "设备说明书",
    "markdown": "# 文档内容",
    "createdAt": "2026-05-25T10:00:00.000Z",
    "updatedAt": "2026-05-25T10:00:00.000Z"
  }
}
```

#### 失败响应

- `404 not_found`：文档不存在

### 3.5 删除文档

### DELETE `/api/reference-libraries/:referenceLibraryId/documents/:documentId`

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |
| documentId | string | 文档 ID |

#### 成功响应

状态码：`200`

```json
{
  "deleted": true,
  "documentId": "uuid"
}
```

#### 失败响应

- `404 not_found`：文档不存在

---

## 4. 知识库搜索

### POST `/api/reference-libraries/:referenceLibraryId/search`

基于查询文本对知识库内已完成索引的文档进行匹配，并返回命中文档的摘要结果。

#### 路径参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| referenceLibraryId | string | 知识库 ID |

#### 请求体

```json
{
  "query": "设备保养周期",
  "conversationId": "optional-conversation-id"
}
```

#### 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| query | string | 是 | 去除首尾空白后不能为空 |
| conversationId | string | 否 | 可选会话 ID，当前服务实现未使用该字段参与搜索 |

#### 成功响应

状态码：`200`

命中文档示例：

```json
{
  "response": "设备说明书\n\n保养周期为每 30 天一次",
  "document": {
    "documentId": "uuid",
    "title": "设备说明书",
    "summary": "保养周期为每 30 天一次",
    "indexStatus": "ready"
  },
  "indexStatus": "ready"
}
```

无可搜索索引时示例：

```json
{
  "response": "",
  "document": null,
  "indexStatus": "pending"
}
```

#### 返回字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| response | string | 返回给调用方的文本结果，格式为 `标题 + 空行 + 摘要` |
| document | object \| null | 命中的文档信息 |
| document.documentId | string | 文档 ID |
| document.title | string | 文档标题 |
| document.summary | string \| null | 文档摘要 |
| document.indexStatus | string | 文档索引状态 |
| indexStatus | string | 本次搜索对应的整体索引状态；无 ready 文档时为 `pending` |

#### 失败响应

- `400 invalid_request`：请求体不合法
- `404 not_found`：知识库不存在

---

## 5. 全局错误码

当前在 `src/` 中可见的错误码包括：

| code | 含义 |
| --- | --- |
| invalid_request | 请求参数错误、缺少 Token、Token 非法 |
| not_found | 资源不存在 |
| name_conflict | 知识库名称冲突 |
| content_too_large | 文档内容超限 |
| internal_error | 服务内部错误 |

---

## 6. 代码来源

本文档整理依据：

- `src/app/index.ts`
- `src/app/auth.ts`
- `src/app/routes/health.ts`
- `src/modules/reference-libraries/routes.ts`
- `src/modules/reference-libraries/schema.ts`
- `src/modules/reference-libraries/types.ts`
- `src/modules/reference-documents/routes.ts`
- `src/modules/reference-documents/schema.ts`
- `src/modules/reference-documents/types.ts`
- `src/modules/reference-documents/service.ts`
- `src/modules/reference-documents/mapper.ts`
- `src/modules/indexing/service.ts`
