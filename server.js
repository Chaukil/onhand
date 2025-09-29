const http = require('http');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3001;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/' && req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Lỗi: Không thể tải index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
        return;
    }

    if (req.url === '/api/query' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { host, username, password, sql } = JSON.parse(body);
                
                if (!host || !username || !password || !sql) {
                    return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                        success: false, 
                        error: 'Thiếu thông số bắt buộc.' 
                    }));
                }

                console.log(`🔍 SQL Query: ${sql.substring(0, 50)}...`);

                const scriptPath = path.join(__dirname, 'get-data.ps1');
                
                if (!fs.existsSync(scriptPath)) {
                    return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                        success: false, 
                        error: 'File get-data.ps1 không tồn tại.' 
                    }));
                }
                
                // Escape SQL
                const escapedSql = sql.replace(/"/g, '`"');
                
                const command = `powershell -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}" -SystemHost "${host}" -Username "${username}" -Password "${password}" -Sql "${escapedSql}"`;

                console.log('⚙️ Executing PowerShell...');

                exec(command, { 
                    maxBuffer: 1024 * 1024 * 50,
                    timeout: 300000,
                    encoding: 'utf8'
                }, (error, stdout, stderr) => {
                    
                    console.log('📤 PowerShell completed');
                    
                    if (error) {
                        console.error('❌ Execution error:', error);
                        return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                            success: false, 
                            error: 'Lỗi thực thi PowerShell', 
                            details: error.message
                        }));
                    }

                    if (stderr && stderr.trim() !== '') {
                        console.error('❌ PowerShell stderr:', stderr);
                        
                        // Thử parse stderr như JSON error
                        try {
                            const errorObj = JSON.parse(stderr.trim());
                            if (errorObj.error) {
                                return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                                    success: false, 
                                    error: errorObj.error
                                }));
                            }
                        } catch (e) {
                            // Nếu không parse được, trả về stderr như text
                            return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                                success: false, 
                                error: 'PowerShell error', 
                                details: stderr.substring(0, 500)
                            }));
                        }
                    }

                    if (!stdout || stdout.trim() === '') {
                        console.error('❌ Empty stdout');
                        return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                            success: false, 
                            error: 'Không có dữ liệu từ PowerShell' 
                        }));
                    }

                    try {
                        console.log('📊 Stdout length:', stdout.length);
                        console.log('📊 First 100 chars:', stdout.substring(0, 100));
                        
                        // Parse JSON
                        const data = JSON.parse(stdout.trim());
                        console.log(`✅ Success! Parsed ${Array.isArray(data) ? data.length : 'N/A'} records`);
                        
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: true, data }));
                        
                    } catch (parseError) {
                        console.error('❌ JSON parse error:', parseError);
                        console.error('📄 Raw output:', stdout.substring(0, 500));
                        
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: 'Không thể phân tích dữ liệu từ PowerShell', 
                            details: parseError.message,
                            rawOutput: stdout.substring(0, 200)
                        }));
                    }
                });
                
            } catch (e) {
                console.error('❌ JSON parse error:', e);
                res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 
                    success: false, 
                    error: 'JSON không hợp lệ' 
                }));
            }
        });
        return;
    }
    
    res.writeHead(404).end('Not Found');
});

server.listen(PORT, () => {
    console.log('🚀 Ashley Inventory System');
    console.log(`✅ Server: http://localhost:${PORT}`);
    
    // Check files
    ['index.html', 'get-data.ps1'].forEach(file => {
        const exists = fs.existsSync(path.join(__dirname, file));
        console.log(`${exists ? '✅' : '❌'} ${file}`);
    });
});
