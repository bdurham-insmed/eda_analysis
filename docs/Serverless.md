# Serverless

## What is Serverless?

Serverless is a cloud computing execution model where the cloud provider dynamically manages the allocation and provisioning of servers. 
Developers write and deploy code without managing the underlying infrastructure. 

While Event driven architecture within Serverless i common, serverless has broader applications beyond just event-driven systems.

**NOTE** - the name is misleading as it means that server management is abstracted away from the developer.
## Key Concepts

- **Function as a Service (FaaS):** Deploy individual functions that execute in response to events (e.g., HTTP requests, queue messages).
- **Backend as a Service (BaaS):** Use third-party services for backend functionality (e.g., authentication, databases, storage).
- **Event-driven:** Serverless functions are triggered by events, making them ideal for microservices and reactive architectures.
- **Automatic Scaling:** Functions scale up or down automatically based on demand.
- **Pay-per-use:** Billing is based on actual usage (invocations, execution time), not on pre-allocated resources.

## Benefits
Various benefits of serverless architecture include:
- **Reduced Operational Overhead:** No need to manage servers, OS, or runtime environments.
- **Cost Efficiency:** Pay only for what you use.
- **Scalability:** Automatic scaling to handle variable workloads.
- **Faster Time to Market:** Focus on business logic, not infrastructure.

## Drawbacks
While benefits are numerous, there are some drawbacks to consider:
- **Cold Starts:** Initial invocation latency due to function startup.
- **Vendor Lock-in:** Tightly coupled to specific cloud provider APIs and services.
- **Limited Execution Time:** Functions may have maximum execution time limits unless using services like GCP Batch for long-running tasks which is designed for data pipelines / genomic applications.
- **Debugging Complexity:** Harder to debug distributed, event-driven systems.

### Supported Languages

While this list is not exhaustive, gives an idea of popular languages used in serverless architectures:
- **Python, Go, Rust:** All support serverless deployment via AWS Lambda, Google Cloud Functions, or Azure Functions.
- **JavaScript/TypeScript (Node.js):** Widely used for serverless APIs and event handlers.

### Example Use Cases

- **API Endpoints:** Deploy REST or GraphQL endpoints as serverless functions.
- **Data Processing:** Use serverless for ETL, data transformation, or event-driven workflows.
- **Webhooks:** Handle external service callbacks with serverless functions.
- **Scheduled Tasks:** Run periodic jobs (e.g., cleanup, reporting) without dedicated servers.

## Best Practices

- **Keep Functions Small:** Single-purpose, stateless functions are easier to manage and scale.
- **Use Managed Services:** Offload authentication, storage, and messaging to cloud services.
- **Monitor and Log:** Use cloud-native monitoring and logging tools for observability.
- **Secure Endpoints:** Implement authentication and authorization for all exposed functions.
- **Leverage Batch for Long-running Tasks:** Use services like GCP Batch for tasks that exceed typical serverless execution limits.

## Suitable Scenarios
Serverless is suitable for:

- Microservices architectures
- Rapid prototyping and MVPs
- Event-driven systems
- Scalable APIs and backends
- High-throughput and long-running batch jobs (using GCP Batch)

---

**References and further reading:**
- [AWS Lambda](https://aws.amazon.com/lambda/)
- [Google Cloud Functions](https://cloud.google.com/functions)
- [Azure Functions](https://azure.microsoft.com/en-us/services/functions/)
- [Serverless Framework](https://www.serverless.com/)
- [Google Cloud Batch](https://cloud.google.com/batch)
