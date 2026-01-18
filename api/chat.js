import fetch from 'node-fetch';

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const apiKey = process.env.API_KEY; 
        const url = "https://api.anthropic.com/v1/messages"; 


        if (!apiKey) {
            return res.status(500).json({ error: "API Key is missing!" });
        }

        const body = JSON.stringify({
            model: 'claude-sonnet-4-5', 
            messages: req.body.messages, 
        });

        try {
            // Make the POST request to the AI model's endpoint
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
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
