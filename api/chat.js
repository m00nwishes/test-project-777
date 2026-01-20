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
                stream: false
            };
            
            if (systemPrompt) {
                requestBody.system = systemPrompt;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey, // Always use the env variable, not anything from request
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(requestBody),
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                return res.status(response.status).json(data);
            }
            
            // Extract the text content
            const messageContent = data.content?.[0]?.text || '';
            
            if (!messageContent) {
                return res.status(500).json({ error: 'No content received from Claude' });
            }
            
            // Return in OpenAI format
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
            
        } catch (error) {
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