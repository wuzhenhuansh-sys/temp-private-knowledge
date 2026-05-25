# AI Large Model Knowledge Base

大型语言模型系统通常围绕预训练、对齐和推理服务三个阶段组织。预训练阶段关注 token 覆盖率、数据清洗、去重策略和多语言语料比例；对齐阶段更关注 instruction tuning、reward modeling、preference data 与 safety policy；上线后的推理阶段则关心上下文窗口、KV cache、batching、吞吐、延迟和成本。

在知识库检索增强生成，也就是 RAG 场景里，embedding 模型负责把文档与查询映射到统一向量空间，随后向量数据库根据 cosine similarity 或 inner product 找到最相关的 chunk。为了提升召回质量，常见做法包括标题增强、query rewrite、多路召回、rerank 与 metadata filtering。对企业场景来说，还需要控制知识时效性、权限隔离以及 hallucination 风险。

当前主流模型架构中，MoE 能用更低的激活参数规模换取更强表达能力，而长上下文能力又直接影响 agent、代码分析和长文档问答效果。评估一个大模型服务是否可用，不应只看 benchmark，还要看 token 吞吐、首 token 延迟、embedding 维度兼容性、函数调用稳定性，以及不同业务提示词下的结果一致性。