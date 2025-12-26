// 配置文件

// 默认配置
const defaultConfig = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0'
    },
    
    // 目标TTS API配置
    targetApi: {
        url: process.env.TARGET_TTS_API_URL || 'https://user.api.hudunsoft.com/v1/alivoice/texttoaudio',
        apiKey: process.env.TTS_API_KEY || '64298820cb19e8d896641c02cca2adba', // x-credits
        timeout: process.env.TARGET_API_TIMEOUT || 30000, // 30秒
        retryCount: process.env.TARGET_API_RETRY_COUNT || 2,
        // 特定API的额外配置
        hudunsoft: {
            xDomain: process.env.HUDUNSOFT_X_DOMAIN || 'user.api.hudunsoft.com',
            xProduct: process.env.HUDUNSOFT_X_PRODUCT || '335',
            xVersion: process.env.HUDUNSOFT_X_VERSION || '5.7.0.0',
            client: process.env.HUDUNSOFT_CLIENT || 'web',
            source: process.env.HUDUNSOFT_SOURCE || '335',
            softVersion: process.env.HUDUNSOFT_SOFT_VERSION || 'V4.4.0.0',
            deviceId: process.env.HUDUNSOFT_DEVICE_ID || 'e97be36a465f47e18bd2853a985374d4',
            token: process.env.HUDUNSOFT_TOKEN || 'e97be36a465f47e18bd2853a985374d4',
            bgId: process.env.HUDUNSOFT_BG_ID || '0',
            bgVolume: process.env.HUDUNSOFT_BG_VOLUME || '5',
            volume: process.env.HUDUNSOFT_VOLUME || '5',
            pitchRate: process.env.HUDUNSOFT_PITCH_RATE || '5',
            bgUrl: process.env.HUDUNSOFT_BG_URL || ''
        }
    },
    
    // 认证配置
    auth: {
        enabled: process.env.API_AUTH_ENABLED === 'true',
        apiKey: process.env.API_KEY || null
    },
    
    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info', // info, debug, error
        file: process.env.LOG_FILE || null // 如果设置，则同时输出到文件
    },
    
    // 缓存配置
    cache: {
        enabled: process.env.CACHE_ENABLED === 'true',
        ttl: process.env.CACHE_TTL || 3600, // 缓存时间，单位秒
        maxSize: process.env.CACHE_MAX_SIZE || 1000 // 最大缓存条目数
    },
    
    // 限流配置
    rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED === 'true',
        windowMs: process.env.RATE_LIMIT_WINDOW || 60000, // 1分钟
        max: process.env.RATE_LIMIT_MAX || 100 // 每分钟最大请求数
    }
};

// 语音映射配置
const voiceMapping = {
    // OpenAI语音名称 -> 目标API语音ID
    'alloy': process.env.VOICE_ALLOY || 'voice1',
    'echo': process.env.VOICE_ECHO || 'voice2',
    'fable': process.env.VOICE_FABLE || 'voice3',
    'onyx': process.env.VOICE_ONYX || 'voice4',
    'nova': process.env.VOICE_NOVA || 'voice5',
    'shimmer': process.env.VOICE_SHIMMER || 'voice6',
    'ash': process.env.VOICE_ASH || 'voice6',
     'ballad': process.env.VOICE_BALLAD || 'voice6',
    'coral': process.env.VOICE_CORAL || 'voice6',
    'sage': process.env.VOICE_SAGE || 'voice6',
    'verse': process.env.VOICE_VERSE || 'voice6',
    'marin': process.env.VOICE_MARIN || 'voice6',
    'cedar': process.env.VOICE_SCEDAR || 'voice6'
};

// 格式映射配置
const formatMapping = {
    'mp3': 'audio/mpeg',
    'opus': 'audio/opus',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    'wav': 'audio/wav',
    'amr': 'audio/amr'
};

// 导出配置
module.exports = {
    config: defaultConfig,
    voiceMapping,
    formatMapping
};
