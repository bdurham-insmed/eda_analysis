# WebSockets

## What are WebSockets?

WebSockets are a protocol that enables full-duplex, bidirectional communication between the client and the server over a single, long-lived TCP connection. Unlike HTTP, which is request-response based, WebSockets allow both the client and server to send data at any time, making them ideal for real-time applications.

Like for instance...the real-time pipeline state updates in this project!

## Key Details

1. **Handshake**: The connection starts with an HTTP handshake, where the client requests an upgrade to the WebSocket protocol.
2. **Persistent Connection**: Once established, the connection remains open, allowing continuous data exchange.
3. **Low Latency**: Data can be sent and received instantly, reducing the overhead of repeated HTTP requests.

## Use Cases

- Real-time chat applications
- Live notifications and updates
- Collaborative editing tools
- Online gaming
- Financial trading platforms

## WebSockets in This Project

WebSockets has been integrated into this project as follows:
- The API server uses WebSockets to push real-time pipeline state updates to the frontend dashboard. This allows users to see the current status of pipelines without needing to refresh the page.
- The frontend establishes a WebSocket connection to the API server and listens for incoming messages containing pipeline state changes.

## Example Implementation
### Server-Side (Python with FastAPI)

```python
from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
app = FastAPI()
@app.websocket("/ws/pipeline")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Message received: {data}")
```
### Client-Side

```typescript
const socket = new WebSocket("ws://localhost:8000/ws/pipeline");
socket.onmessage = function(event) {
    console.log("Message from server ", event.data); // Handle incoming messages from the server
};
socket.onopen = function(event) {
    socket.send("Hello Server!"); // Send a message to the server
};
```

## Security Considerations

- Use `wss://` (WebSocket Secure) in production to encrypt data.
- Implement authentication and authorization.
- Handle connection limits and timeouts to prevent abuse.
---
### **References:**
- [MDN WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [WebSocket Protocol Specification](https://datatracker.ietf.org/doc/html/rfc6455)
