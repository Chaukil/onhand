const http = require('http');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3001;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/' && req.method === 'GET') {
        const indexPath = path.join(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
            const content = fs.readFileSync(indexPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        } else {
            res.writeHead(404);
            res.end('index.html not found');
        }
        return;
    }

    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/api/query' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { host, username, password, sql } = JSON.parse(body);
                
                if (!host || !username || !password || !sql) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: 'Missing required parameters' }));
                    return;
                }

                const scriptPath = path.join(__dirname, 'get-data.ps1');
                if (!fs.existsSync(scriptPath)) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: 'get-data.ps1 not found' }));
                    return;
                }

                // Tạo temp file với parameters
                const tempDir = require('os').tmpdir();
                const tempFile = path.join(tempDir, `ashley_query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`);
                
                // Clean SQL - loại bỏ xuống dòng và space thừa
                const cleanSql = sql.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
                
                const params = {
                    server: host,
                    user: username,
                    pass: password,
                    sql: cleanSql
                };
                
                fs.writeFileSync(tempFile, JSON.stringify(params, null, 2), 'utf8');

                // Command đơn giản với temp file
                const cmd = `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}" -ParamFile "${tempFile}"`;

                console.log('Executing PowerShell with temp file:', tempFile);

                exec(cmd, { 
                    timeout: 120000,
                    maxBuffer: 1024 * 1024 * 10,
                    encoding: 'utf8'
                }, (error, stdout, stderr) => {
                    
                    // Cleanup temp file
                    try { 
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile); 
                        }
                    } catch (e) {
                        console.log('Could not delete temp file:', e.message);
                    }
                    
                    if (error) {
                        console.error('PowerShell Error:', error.message);
                        res.writeHead(500);
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: 'PowerShell execution failed: ' + error.message 
                        }));
                        return;
                    }

                    if (stderr && stderr.trim()) {
                        console.error('PowerShell stderr:', stderr);
                        res.writeHead(500);
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: stderr.trim()
                        }));
                        return;
                    }

                    if (!stdout || !stdout.trim()) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: 'No output from PowerShell' 
                        }));
                        return;
                    }

                    try {
                        // Clean output - chỉ lấy JSON
                        let cleanOutput = stdout.trim();
                        
                        // Tìm JSON boundaries
                        const jsonStart = cleanOutput.indexOf('[') !== -1 ? cleanOutput.indexOf('[') : cleanOutput.indexOf('{');
                        const jsonEnd = cleanOutput.lastIndexOf(']') !== -1 ? cleanOutput.lastIndexOf(']') : cleanOutput.lastIndexOf('}');
                        
                        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                            cleanOutput = cleanOutput.substring(jsonStart, jsonEnd + 1);
                        }

                        const data = JSON.parse(cleanOutput);
                        console.log(`Success: ${Array.isArray(data) ? data.length : 1} records`);
                        
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, data }));

                    } catch (parseError) {
                        console.error('JSON Parse Error:', parseError.message);
                        console.error('Raw output (first 1000):', stdout.substring(0, 1000));
                        res.writeHead(500);
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: 'Failed to parse JSON response: ' + parseError.message,
                            raw: stdout.substring(0, 500)
                        }));
                    }
                });

            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON request: ' + e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`🚀 Ashley Inventory System running on http://localhost:${PORT}`);
    console.log(`📁 Working directory: ${__dirname}`);
    
    const requiredFiles = ['index.html', 'get-data.ps1'];
    requiredFiles.forEach(file => {
        const fullPath = path.join(__dirname, file);
        const exists = fs.existsSync(fullPath);
        console.log(`${exists ? '✅' : '❌'} ${file} - ${fullPath}`);
    });
});
