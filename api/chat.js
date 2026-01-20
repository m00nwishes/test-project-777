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
            return res.status(500).json({ error: "API Key is missing!" });
        }

        // Separate system messages from regular messages
        const systemMessages = req.body.messages.filter(msg => msg.role === 'system');
        const regularMessages = req.body.messages.filter(msg => msg.role !== 'system');
        
        // Combine system messages into one string
        const systemPrompt = systemMessages.map(msg => msg.content).join('\n\n');

        const body = JSON.stringify({
            model: 'claude-sonnet-4-5-20250929', 
            max_tokens: 4096,
            messages: regularMessages,
            ...(systemPrompt && { system: systemPrompt }) // Only add system if it exists
        });

        try {
            // Make the POST request to the AI model's endpoint
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: body,
            });
            const data = await response.json();
            // If the response is not OK (status 200), return the error message
            if (!response.ok) {
                return res.status(response.status).json({ error: data.error || 'Unknown Error' });
            }
            // If successful, send the data back to the client
            res.status(200).json(data);
        } catch (error) {
            // In case of any error, send it back to the client
            res.status(500).json({ error: error.message || 'Something went wrong with the API call.' });
        }
    } else {
        // If method is not POST, send a 405 Method Not Allowed error
        res.status(405).json({ error: 'Method Not Allowed' });
    }
}