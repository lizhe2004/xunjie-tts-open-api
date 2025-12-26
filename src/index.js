// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { config, voiceMapping, formatMapping } = require('./config');

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

// 确保日志目录存在
if (config.logging.file) {
    try {
        // 使用绝对路径确保在任何工作目录下都能正确解析
        const logFilePath = path.isAbsolute(config.logging.file) 
            ? config.logging.file 
            : path.join(__dirname, '..', config.logging.file);
        const logDir = path.dirname(logFilePath);
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
            logger('info', `Created log directory: ${logDir}`);
        }
        // 更新配置中的日志文件路径为绝对路径
        config.logging.file = logFilePath;
    } catch (error) {
        // 记录错误但不中断应用运行
        console.error(`Failed to create log directory: ${error.message}`);
        // 禁用文件日志，但继续使用控制台日志
        config.logging.file = null;
    }
}

// 日志记录函数
function logger(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // 输出到控制台
    if (level === 'error' || level === 'info') {
        console[level](logMessage);
    } else {
        console.log(logMessage);
    }
    
    // 输出到文件
    if (config.logging.file) {
        fs.appendFileSync(config.logging.file, logMessage + '\n', (err) => {
            if (err) console.error('Failed to write to log file:', err);
        });
    }
}

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 请求日志中间件
app.use((req, res, next) => {
    logger('info', `${req.method} ${req.path} ${req.ip}`);
    next();
});

// 限流中间件
if (config.rateLimit.enabled) {
    const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger('warn', `Rate limit exceeded for ${req.ip}`);
            res.status(429).json({
                error: {
                    message: 'Rate limit exceeded',
                    type: 'rate_limit_error',
                    param: null,
                    code: 'too_many_requests'
                }
            });
        }
    });
    app.use('/v1/audio/speech', limiter);
    logger('info', `Rate limiting enabled: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs/1000}s`);
}

// 认证中间件
if (config.auth.enabled && config.auth.apiKey) {
    app.use('/v1/audio/speech', (req, res, next) => {
        const authHeader = req.headers.authorization;
        const apiKey = authHeader && authHeader.split(' ')[1];
        
        if (!apiKey || apiKey !== config.auth.apiKey) {
            logger('warn', `Unauthorized request: Invalid API key from ${req.ip}`);
            return res.status(401).json({
                error: {
                    message: 'Invalid authentication credentials',
                    type: 'invalid_request_error',
                    param: null,
                    code: 'invalid_api_key'
                }
            });
        }
        next();
    });
    logger('info', 'API authentication enabled');
}

// 创建axios实例
const axiosInstance = axios.create({
    timeout: config.targetApi.timeout,
    headers: {
        'Content-Type': 'application/json'
    }
});

// 简单的内存缓存实现
let cache = new Map();

// 健康检查端点
app.get('/health', (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: require('./package.json').version,
        memoryUsage: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
        }
    });
});

// 创建一个通用的TTS生成函数来处理核心逻辑
async function generateTTS({ text, voice, speed = 1.0, emotion, format = 'mp3', isDemo = false, requestId = null }) {
    try {
        // 日志记录请求参数
        if (config.logging.level === 'debug') {
            const prefix = isDemo ? 'Demo ' : '';
            logger('debug', `${prefix}TTS Request: voice=${voice}, speed=${speed}, emotion=${emotion || 'none'}, input_length=${text.length}`);
        }

        // 检查缓存（如果启用）
        let cachedAudio = null;
        if (config.cache.enabled) {
            const prefix = isDemo ? 'demo_' : '';
            const cacheKey = `${prefix}${voice}_${speed}_${emotion || 'none'}_${format}_${text.substring(0, 100)}`;
            cachedAudio = getFromCache(cacheKey);
            if (cachedAudio) {
                const prefix = isDemo ? 'Demo ' : '';
                logger('info', `Cache hit for ${prefix}TTS request`);
                return {
                    audioData: cachedAudio,
                    format,
                    isCached: true
                };
            }
        }

        // 转换为目标TTS API的请求格式
        const hudunsoftConfig = config.targetApi.hudunsoft;
        
        // 将speed转换为speech_rate (0.25-4.0 映射到 1-10)
        
        var speechRate = Math.round((parseFloat(speed) - 1) / 3 * 6) + 5;
        if (speed<=0.3)
            speechRate=2
        else if ( speed<0.5)
            speechRate=3
        else  if ( speed<0.8)
            speechRate=4
        else if (speed>=0.8 && speed<1.2)
            speechRate = 5;
      else if (speed>=1.2 && speed<1.5)
            speechRate = 6;

        // 准备表单数据
        const formData = new URLSearchParams();
        formData.append('client', hudunsoftConfig.client);
        formData.append('source', hudunsoftConfig.source);
        formData.append('soft_version', hudunsoftConfig.softVersion);
        formData.append('device_id', hudunsoftConfig.deviceId);
        formData.append('text', text);
        formData.append('bgid', hudunsoftConfig.bgId);
        formData.append('bg_volume', hudunsoftConfig.bgVolume);
        formData.append('format', 'mp3');
        formData.append('voice', voiceMapping[voice] || voice); // 使用映射的语音ID或原始语音ID
        if (emotion) {
            formData.append('emotion', emotion);
        }
        formData.append('volume', hudunsoftConfig.volume);
        formData.append('speech_rate', speechRate.toString());
        formData.append('pitch_rate', hudunsoftConfig.pitchRate);
        formData.append('title', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
        formData.append('token', hudunsoftConfig.token);
        formData.append('bg_url', hudunsoftConfig.bgUrl);

        // 调用目标TTS API（带重试机制）
        let response;
        let retryCount = 0;
        const startTime = Date.now();
        
        logger('debug', `Calling TTS API with parameters: text=${text.substring(0, 20)}..., voice=${voice}, speed=${speed}, emotion=${emotion || 'none'}, format=${format}`);
        logger('debug', `Calling TTS API with parameters: formData=${formData.toString()}`);
        
        let headers = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'x-credits': config.targetApi.apiKey,
            'x-domain': hudunsoftConfig.xDomain,
            'x-product': hudunsoftConfig.xProduct,
            'x-version': hudunsoftConfig.xVersion,
            'accept': 'application/json, text/javascript, */*; q=0.01',
            ...(config.auth.apiKey && { 'X-API-Key': config.auth.apiKey })
        };

        while (retryCount <= config.targetApi.retryCount) {
            try {
                response = await axiosInstance.post(config.targetApi.url, formData.toString(), {
                    headers: headers,
                    responseType: 'json' // 先以JSON格式接收响应
                });
                break; // 成功获取响应后跳出循环
            } catch (err) {
                retryCount++;
                
                logger('debug', `API request failed: ${JSON.stringify(err.response?.data || err.message)}`);
                
                if (retryCount > config.targetApi.retryCount || err.response?.status === 400 || err.response?.status === 401) {
                    // 如果超过重试次数或者是400/401错误，不再重试
                    throw err;
                }
                
                logger('warn', `Request failed, retrying (${retryCount}/${config.targetApi.retryCount})... Error: ${err.message}`);
                // 指数退避
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
            }
        }

        // 处理API响应，获取音频数据
        let audioData;
        try {
            // 检查API响应
            logger('debug', `API response: ${JSON.stringify(response.data)}`);
            
            if (response.data.code === 0) {
                // 直接返回了音频URL
                const audioUrl = response.data.data.file_link;
                logger('info', `Received audio file URL directly: ${audioUrl}`);
                
                // 下载音频文件
                let audioResponse = await downloadAudioFile(audioUrl);
                audioData = Buffer.from(audioResponse.data);
                logger('info', `TTS request completed successfully, audio size: ${Math.round(audioData.length / 1024)}KB`);
            } else if (response.data.code === '2105' && response.data.data && response.data.data.task_id) {
                // 需要轮询任务状态
                const taskId = response.data.data.task_id;
                logger('info', `Received task ID for polling: ${taskId}`);
                
                // 轮询任务状态直到完成
                const audioUrl = await pollTaskStatus(taskId, hudunsoftConfig);
                
                // 下载音频文件
                let audioResponse = await downloadAudioFile(audioUrl);
                audioData = Buffer.from(audioResponse.data);
                logger('info', `TTS request completed successfully after polling, audio size: ${Math.round(audioData.length / 1024)}KB`);
            } else {
                throw new Error(`Target TTS API returned error: ${response.data.message || 'Unknown error'} - Response data: ${JSON.stringify(response.data)}`);
            }
            
            // 如果请求的格式是AMR，且原始返回的音频不是AMR格式，需要进行格式转换
            if (format === 'amr') {
                logger('info', 'Requesting AMR format, checking if conversion is needed');
                
                // 检查URL中的文件扩展名，判断是否需要转换
                let needConversion = true;
                if (response.data.data && response.data.data.file_link) {
                    // 移除URL中的查询参数后再获取文件扩展名
                    const urlWithoutQuery = response.data.data.file_link.split('?')[0];
                    const fileExtension = path.extname(urlWithoutQuery).toLowerCase().replace('.', '');
                    needConversion = fileExtension !== 'amr';
                }
                
                if (needConversion) {
                    logger('info', 'AMR conversion needed, performing audio format conversion');
                    try {
                        audioData = await convertAudioFormat(audioData, 'amr');
                        logger('info', `Successfully converted audio to AMR format, new size: ${Math.round(audioData.length / 1024)}KB`);
                    } catch (conversionError) {
                        logger('error', `Failed to convert audio to AMR format: ${conversionError.message}`);
                        // 转换失败时，仍然返回原始音频数据
                    }
                } else {
                    logger('debug', 'Audio is already in AMR format, no conversion needed');
                }
            }
            
            // 如果请求的格式是OPUS，且原始返回的音频不是OPUS格式，需要进行格式转换
            if (format === 'opus') {
                logger('info', 'Requesting OPUS format, checking if conversion is needed');
                
                // 检查URL中的文件扩展名，判断是否需要转换
                let needConversion = true;
                if (response.data.data && response.data.data.file_link) {
                    // 移除URL中的查询参数后再获取文件扩展名
                    const urlWithoutQuery = response.data.data.file_link.split('?')[0];
                    const fileExtension = path.extname(urlWithoutQuery).toLowerCase().replace('.', '');
                    needConversion = fileExtension !== 'opus';
                }
                
                if (needConversion) {
                    logger('info', 'OPUS conversion needed, performing audio format conversion');
                    try {
                        audioData = await convertAudioFormat(audioData, 'opus');
                        logger('info', `Successfully converted audio to OPUS format, new size: ${Math.round(audioData.length / 1024)}KB`);
                    } catch (conversionError) {
                        logger('error', `Failed to convert audio to OPUS format: ${conversionError.message}`);
                        // 转换失败时，仍然返回原始音频数据
                    }
                } else {
                    logger('debug', 'Audio is already in OPUS format, no conversion needed');
                }
            }
        } catch (err) {
            logger('error', `Error processing TTS response: ${err.message}`);
            throw err;
        }

        // 存入缓存（如果启用）
        if (config.cache.enabled) {
            const prefix = isDemo ? 'demo_' : '';
            const cacheKey = `${prefix}${voice}_${speed}_${emotion || 'none'}_${format}_${text.substring(0, 100)}`;
            addToCache(cacheKey, audioData);
        }

        // 记录响应时间
        const responseTime = Date.now() - startTime;
        logger('info', `${isDemo ? 'Demo ' : ''}TTS API调用成功，响应时间: ${responseTime}ms，音色: ${voice}`);

        return {
            audioData,
            format,
            isCached: false
        };
    } catch (error) {
        logger('error', `${isDemo ? 'Demo ' : ''}TTS API Error: ${error.message}`);
        logger('debug', `Error details: ${error.response ? JSON.stringify(error.response.data) : JSON.stringify(error)}`);
        throw error;
    }
}

// OpenAI兼容格式的TTS API端点
app.post('/v1/audio/speech', async (req, res) => {
    try {
        // 验证请求参数
        const { model, input, voice, response_format = 'mp3', speed = 1.0, emotion } = req.body;
        
        if (!model || !input || !voice) {
            logger('warn', `Missing required parameters: ${!model ? 'model' : ''} ${!input ? 'input' : ''} ${!voice ? 'voice' : ''}`);
            return res.status(400).json({
                error: {
                    message: "Missing required parameters: model, input, or voice",
                    type: "invalid_request_error",
                    param: null,
                    code: null
                }
            });
        }

        // 限制输入文本长度
        if (input.length > 4096) {
            logger('warn', `Input text too long: ${input.length} characters`);
            return res.status(400).json({
                error: {
                    message: "Input text too long. Maximum length is 4096 characters.",
                    type: "invalid_request_error",
                    param: "input",
                    code: "text_too_long"
                }
            });
        }

        // 调用通用TTS生成函数
        const result = await generateTTS({
            text: input,
            voice,
            speed,
            emotion,
            format: response_format,
            isDemo: false
        });

        // 设置响应头
        res.set({
            'Content-Type': formatMapping[response_format] || 'audio/mpeg',
            'Content-Disposition': `attachment; filename="speech.${response_format}"`,
            'X-Processed-By': 'OpenAI-Compat-TTS-API',
            'X-Cache': result.isCached ? 'HIT' : 'MISS'
        });

        // 发送音频数据
        res.send(result.audioData);

    } catch (error) {
        logger('error', `TTS API Error: ${error.message}`);
        logger('debug', `Error details: ${error.response ? JSON.stringify(error.response.data) : JSON.stringify(error)}`);
        
        // 错误处理
        if (error.response) {
            // 目标API返回了错误响应
            res.status(error.response.status || 500).json({
                error: {
                    message: error.response.data.message || 'Error processing TTS request',
                    type: 'api_error',
                    param: null,
                    code: error.response.status,
                    details: error.response.data // 包含完整的错误详情
                }
            });
        } else if (error.request) {
            // 请求已发送但未收到响应
            res.status(504).json({
                error: {
                    message: 'No response from TTS service',
                    type: 'timeout_error',
                    param: null,
                    code: 'service_unavailable'
                }
            });
        } else {
            // 其他错误
            res.status(500).json({
                error: {
                    message: error.message || 'Internal server error',
                    type: 'server_error',
                    param: null,
                    code: null
                }
            });
        }
    }
});

// 添加提供voice_member.json数据的路由
app.get('/api/voice-data', (req, res) => {
    try {
        const voiceFilePath = path.join(__dirname, 'voice_member.json');
        const voiceData = fs.readFileSync(voiceFilePath, 'utf-8');
        res.json(JSON.parse(voiceData));
    } catch (error) {
        console.error('读取voice_member.json失败:', error);
        res.status(500).json({
            code: 500,
            message: '读取语音数据失败',
            data: null
        });
    }
});

// 添加生成TTS音频的路由
app.get('/api/generate-tts', async (req, res) => {
    try {
        const { text, voice, speed = 1.0, emotion, response_format = 'mp3' } = req.query;
        
        if (!text || !voice) {
            logger('warn', `Missing required parameters: ${!text ? 'text' : ''} ${!voice ? 'voice' : ''}`);
            return res.status(400).json({
                code: 400,
                message: '缺少必要的参数',
                data: null
            });
        }
        
        // 解码Base64编码的文本
        const decodedText = decodeURIComponent(Buffer.from(text, 'base64').toString());
        
        // 限制输入文本长度
        if (decodedText.length > 4096) {
            logger('warn', `Input text too long: ${decodedText.length} characters`);
            return res.status(400).json({
                code: 400,
                message: '输入文本过长，最大长度为4096个字符',
                data: null
            });
        }

        // 调用通用TTS生成函数
        const result = await generateTTS({
            text: decodedText,
            voice,
            speed,
            emotion,
            format: response_format,
            isDemo: true
        });

        // 设置响应头并返回音频数据
        res.set({
            'Content-Type': formatMapping[response_format] || 'audio/mpeg',
            'Content-Disposition': `attachment; filename="speech.${response_format}"`,
            'X-Processed-By': 'OpenAI-Compat-TTS-API',
            'X-Cache': result.isCached ? 'HIT' : 'MISS'
        });
        res.send(result.audioData);
    } catch (error) {
        logger('error', `Demo TTS API Error: ${error.message}`);
        logger('debug', `Error details: ${error.response ? JSON.stringify(error.response.data) : JSON.stringify(error)}`);
        
        // 错误处理
        if (error.response) {
            // 目标API返回了错误响应
            res.status(error.response.status || 500).json({
                code: error.response.status || 500,
                message: error.response.data.message || '生成音频失败',
                data: null,
                details: error.response.data // 包含完整的错误详情
            });
        } else if (error.request) {
            // 请求已发送但未收到响应
            res.status(504).json({
                code: 504,
                message: 'TTS服务无响应',
                data: null
            });
        } else {
            // 其他错误
            res.status(500).json({
                code: 500,
                message: error.message || '内部服务器错误',
                data: null
            });
        }
    }
});

// 设置根路由以显示语音音色演示页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/voice-demo.html'));
});

// 轮询任务状态函数
async function pollTaskStatus(taskId, hudunsoftConfig) {
    const maxPollingAttempts = 30; // 最大轮询次数
    const pollingInterval = 1000; // 轮询间隔（毫秒）
    let attempts = 0;
    
    while (attempts < maxPollingAttempts) {
        attempts++;
        
        try {
            logger('info', `Polling task status (${attempts}/${maxPollingAttempts}): ${taskId}`);
            
            // 准备表单数据
            const formData = new URLSearchParams();
            formData.append('client', hudunsoftConfig.client);
            formData.append('source', hudunsoftConfig.source);
            formData.append('soft_version', hudunsoftConfig.softVersion);
            formData.append('device_id', hudunsoftConfig.deviceId);
            formData.append('taskId', taskId);
            
            // 调用任务状态查询接口
            const response = await axiosInstance.post('https://user.api.hudunsoft.com/v1/alivoice/textTaskInfo', formData.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-credits': config.targetApi.apiKey,
                    'x-domain': hudunsoftConfig.xDomain,
                    'x-product': hudunsoftConfig.xProduct,
                    'x-version': hudunsoftConfig.xVersion,
                    'accept': 'application/json, text/javascript, */*; q=0.01'
                },
                responseType: 'json'
            });
            
            // 检查响应
            if (response.data.code === 0 && response.data.data && response.data.data.is_complete === 1) {
                // 任务完成
                logger('info', `Task completed successfully, retrieving audio URL`);
                return response.data.data.file_link;
            } else if (response.data.code !== '2105') {
                // 其他错误
                throw new Error(`Task status query failed: ${response.data.message || 'Unknown error'}`);
            }
            
            // 任务未完成，继续轮询
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
            
        } catch (err) {
            logger('error', `Task polling error: ${err.message}`);
            throw err;
        }
    }
    
    throw new Error(`Task polling timeout after ${maxPollingAttempts} attempts`);
}

// 下载音频文件函数
async function downloadAudioFile(audioUrl) {
    try {
        // 创建一个新的axios实例，不使用全局配置，避免Content-Type默认为application/json
        const downloadInstance = axios.create({
            timeout: 60000, // 设置更长的超时时间
        });
        
        logger('debug', `Downloading audio file from URL: ${audioUrl}`);
        const response = await downloadInstance.get(audioUrl, {
            headers: {
                'accept': '*/*',
                'accept-encoding': 'identity;q=1, *;q=0',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'connection': 'keep-alive',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
            },
            responseType: 'arraybuffer' // 确保以二进制格式接收音频数据
        });
        
        logger('debug', `Successfully downloaded audio file, status: ${response.status}, content-length: ${response.headers['content-length']}`);
        return response;
    } catch (err) {
        logger('error', `Failed to download audio file: ${err.message}`);
        logger('debug', `Download error details: ${JSON.stringify({status: err.response?.status, headers: err.response?.headers})}`);
        throw new Error(`Failed to download audio file: ${err.message}`);
    }
}

// 音频格式转换函数
async function convertAudioFormat(audioBuffer, targetFormat) {
    return new Promise((resolve, reject) => {
        try {
            logger('debug', `Converting audio to ${targetFormat} format`);
            
            // 使用系统临时目录，适用于各种环境（包括只读文件系统）
            const tempDir = process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp';
            const tempInputPath = path.join(tempDir, `temp_${Date.now()}_input.wav`);
            const tempOutputPath = path.join(tempDir, `temp_${Date.now()}_output.${targetFormat}`);
            
            // 写入临时输入文件
            fs.writeFileSync(tempInputPath, audioBuffer);
            
            // 使用ffmpeg进行格式转换
            const ffmpegCommand = ffmpeg(tempInputPath).toFormat(targetFormat);
            
            // 根据目标格式设置特定的编码参数
            if (targetFormat === 'amr') {
                // AMR格式特定配置
                ffmpegCommand
                    .audioBitrate('12.2k')
                    .audioChannels(1)
                    .audioFrequency(8000);
            } else if (targetFormat === 'opus') {
                // OPUS格式特定配置
                ffmpegCommand
                    .audioBitrate('16k')
                    .audioChannels(1)
                    .audioFrequency(16000)
                    .outputOptions('-vbr on'); // 启用可变比特率
            }
            
            ffmpegCommand
                .on('end', () => {
                    try {
                        // 读取转换后的文件
                        const convertedBuffer = fs.readFileSync(tempOutputPath);
                        
                        // 删除临时文件
                        try {
                            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                        } catch (cleanupErr) {
                            logger('debug', `Failed to clean up temporary files: ${cleanupErr.message}`);
                            // 清理失败不应影响主流程
                        }
                        
                        logger('debug', `Successfully converted audio to ${targetFormat} format, size: ${Math.round(convertedBuffer.length / 1024)}KB`);
                        resolve(convertedBuffer);
                    } catch (err) {
                        logger('error', `Failed to read or delete temporary files: ${err.message}`);
                        reject(err);
                    }
                })
                .on('error', (err) => {
                    logger('error', `Failed to convert audio format: ${err.message}`);
                    
                    // 尝试删除临时文件
                    try {
                        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                    } catch (cleanupErr) {
                        logger('error', `Failed to clean up temporary files: ${cleanupErr.message}`);
                    }
                    
                    reject(err);
                })
                .save(tempOutputPath);
        } catch (err) {
            logger('error', `Error in convertAudioFormat function: ${err.message}`);
            reject(err);
        }
    });
}

// 缓存管理函数
function addToCache(key, value) {
    // 如果缓存已满，移除最早的项目
    if (cache.size >= config.cache.maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    
    const expiryTime = Date.now() + (config.cache.ttl * 1000);
    cache.set(key, { value, expiryTime });
    
    // 定期清理过期缓存
    setTimeout(() => {
        if (cache.has(key)) {
            const item = cache.get(key);
            if (item.expiryTime <= Date.now()) {
                cache.delete(key);
            }
        }
    }, config.cache.ttl * 1000 + 1000);
}

function getFromCache(key) {
    const item = cache.get(key);
    if (!item) {
        return null;
    }
    
    // 检查是否过期
    if (item.expiryTime <= Date.now()) {
        cache.delete(key);
        return null;
    }
    
    return item.value;
}

// 启动服务器
app.listen(config.server.port, config.server.host, () => {
    logger('info', `OpenAI兼容格式的TTS API服务已启动，监听地址 ${config.server.host}:${config.server.port}`);
    logger('info', `健康检查地址: http://localhost:${config.server.port}/health`);
    logger('info', `TTS API地址: http://localhost:${config.server.port}/v1/audio/speech`);
    logger('info', `目标TTS API: ${config.targetApi.url}`);
});

// 导出app供测试使用
module.exports = app;
