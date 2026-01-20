export default async function handler(req, res) {
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'POST') {
        const apiKey = process.env.API_KEY; 
        const url = "https://api.anthropic.com/v1/messages"; 
        
        if (!apiKey) {
            return res.status(500).json({ error: "API Key is missing from environment variables!" });
        }

        try {
            // Separate system messages from regular messages
            const systemMessages = req.body.messages?.filter(msg => msg.role === 'system') || [];
            const regularMessages = req.body.messages?.filter(msg => msg.role !== 'system') || [];
            
            // Combine system messages into one string
            const systemPrompt = systemMessages.map(msg => msg.content).join('\n\n');

            const requestBody = {
                model: req.body.model || 'claude-sonnet-4-5-20250929', 
                max_tokens: req.body.max_tokens || 4096,
                messages: regularMessages,
                stream: req.body.stream || false,
                temperature: req.body.temperature || 1
            };
            
            if (systemPrompt) {
                requestBody.system = systemPrompt;
            }

            // If streaming is requested
            if (req.body.stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    const error = await response.json();
                    res.write(`data: ${JSON.stringify({ error })}\n\n`);
                    return res.end();
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const data = line.slice(5).trim();
                            
                            if (data === '[DONE]') {
                                res.write('data: [DONE]\n\n');
                                continue;
                            }
                            
                            try {
                                const parsed = JSON.parse(data);
                                
                                // Transform Claude streaming format to OpenAI format
                                if (parsed.type === 'content_block_delta') {
                                    const openaiChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: 'chat.completion.chunk',
                                        created: Math.floor(Date.now() / 1000),
                                        model: requestBody.model,
                                        choices: [{
                                            index: 0,
                                            delta: {
                                                content: parsed.delta?.text || ''
                                            },
                                            finish_reason: null
                                        }]
                                    };
                                    res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
                                } else if (parsed.type === 'message_stop') {
                                    const finalChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: 'chat.completion.chunk',
                                        created: Math.floor(Date.now() / 1000),
                                        model: requestBody.model,
                                        choices: [{
                                            index: 0,
                                            delta: {},
                                            finish_reason: 'stop'
                                        }]
                                    };
                                    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                                    res.write('data: [DONE]\n\n');
                                }
                            } catch (e) {
                                // Skip invalid JSON
                            }
                        }
                    }
                }
                
                return res.end();
                
            } else {
                // Non-streaming response (your original code)
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify(requestBody),
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    return res.status(response.status).json(data);
                }
                
                const messageContent = data.content?.[0]?.text || '';
                
                if (!messageContent) {
                    return res.status(500).json({ error: 'No content received from Claude' });
                }
                
                return res.status(200).json({
                    id: data.id || `chatcmpl-${Date.now()}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: data.model || requestBody.model,
                    choices: [{
                        index: 0,
                        message: {
                            role: "assistant",
                            content: messageContent
                        },
                        finish_reason: data.stop_reason || "stop"
                    }],
                    usage: {
                        prompt_tokens: data.usage?.input_tokens || 0,
                        completion_tokens: data.usage?.output_tokens || 0,
                        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
                    }
                });
            }
            
        } catch (error) {
            console.error('Error:', error);
            return res.status(500).json({ 
                error: {
                    message: error.message || 'Proxy error',
                    type: 'proxy_error'
                }
            });
        }
    } else {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
}