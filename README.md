# OpenAI兼容格式的TTS API服务

这是一个基于Node.js的HTTP服务，提供与OpenAI TTS API兼容的接口格式，并将请求转发到其他TTS服务（如hudunsoft TTS API）进行处理。

## 功能特点

- 提供完全兼容OpenAI TTS API的接口格式
- 支持配置不同的目标TTS API服务（默认支持hudunsoft TTS API）
- 内置请求缓存机制，提高性能和响应速度
- 支持请求限流，防止服务过载
- 支持API认证，保护服务安全
- 完善的错误处理和日志记录
- 可通过环境变量灵活配置
- 支持情感参数(emotion)设置
- 双模式响应处理（直接返回音频URL和任务ID轮询）
- 自动重试机制，确保服务可靠性

## 安装

### 1. 克隆仓库

```bash
# 克隆仓库
git clone https://github.com/yourusername/openai-tts-api.git
cd openai-tts-api
```

### 2. 安装依赖

```bash
# 使用npm安装依赖
npm install
```

### 3. 配置环境变量

复制.env.example文件并根据您的需求修改配置：

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑.env文件（根据您的实际情况修改配置）
# 推荐使用您喜欢的编辑器编辑
```

## 配置选项

在.env文件中，您可以配置以下选项：

### 服务器配置
- `PORT` - 服务器监听端口，默认为3000
- `HOST` - 服务器监听地址，默认为0.0.0.0

### 目标TTS API配置
- `TARGET_TTS_API_URL` - 目标TTS API的URL地址，默认为https://user.api.hudunsoft.com/v1/alivoice/texttoaudio
- `TTS_API_KEY` - 目标TTS API的API密钥（对应hudunsoft的x-credits）
- `TARGET_API_TIMEOUT` - API请求超时时间（毫秒），默认为30000
- `TARGET_API_RETRY_COUNT` - 请求失败时的重试次数，默认为2

### HUDUNSOFT特定配置
- `HUDUNSOFT_X_DOMAIN` - HUDUNSOFT API域名，默认为user.api.hudunsoft.com
- `HUDUNSOFT_X_PRODUCT` - 产品标识，默认为335
- `HUDUNSOFT_X_VERSION` - 版本号，默认为5.7.0.0
- `HUDUNSOFT_CLIENT` - 客户端类型，默认为web
- `HUDUNSOFT_SOURCE` - 来源标识，默认为335
- `HUDUNSOFT_SOFT_VERSION` - 软件版本，默认为V4.4.0.0
- `HUDUNSOFT_DEVICE_ID` - 设备ID，**需要配置为有效的值**
- `HUDUNSOFT_TOKEN` - 认证令牌，**需要配置为有效的值**
- `HUDUNSOFT_BG_ID` - 背景音ID，默认为0
- `HUDUNSOFT_BG_VOLUME` - 背景音音量，默认为5
- `HUDUNSOFT_VOLUME` - 语音音量，默认为4
- `HUDUNSOFT_PITCH_RATE` - 音调，默认为4
- `HUDUNSOFT_BG_URL` - 背景音URL，默认为空字符串

### 认证配置
- `API_AUTH_ENABLED` - 是否启用API认证，设置为true启用，默认为false
- `API_KEY` - 当启用认证时使用的API密钥

### 日志配置
- `LOG_LEVEL` - 日志级别，可选值：debug, info, warn, error，默认为info
- `LOG_FILE` - 日志文件路径，设置后日志会同时输出到文件

### 缓存配置
- `CACHE_ENABLED` - 是否启用请求缓存，设置为true启用，默认为false
- `CACHE_TTL` - 缓存过期时间（秒），默认为3600
- `CACHE_MAX_SIZE` - 最大缓存条目数，默认为1000

### 限流配置
- `RATE_LIMIT_ENABLED` - 是否启用请求限流，设置为true启用，默认为false
- `RATE_LIMIT_WINDOW` - 限流窗口大小（毫秒），默认为60000
- `RATE_LIMIT_MAX` - 限流窗口内的最大请求数，默认为100

### 语音映射配置
- `VOICE_ALLOY` - OpenAI alloy语音对应的目标API语音ID
- `VOICE_ECHO` - OpenAI echo语音对应的目标API语音ID
- `VOICE_FABLE` - OpenAI fable语音对应的目标API语音ID
- `VOICE_ONYX` - OpenAI onyx语音对应的目标API语音ID
- `VOICE_NOVA` - OpenAI nova语音对应的目标API语音ID
- `VOICE_SHIMMER` - OpenAI shimmer语音对应的目标API语音ID

## 运行服务

### 生产环境运行

```bash
npm start
```

### 开发环境运行（自动重启）

```bash
npm run dev
```

## API使用

### 健康检查

```bash
curl http://localhost:3000/health
```

### TTS API（与OpenAI兼容）

```bash
curl http://localhost:3000/v1/audio/speech \n  -H "Content-Type: application/json" \n  -d '{\n    "model": "tts-1",\n    "input": "你好，这是一段测试文本。",\n    "voice": "alloy",\n    "response_format": "mp3",\n    "speed": 1.0,\n    "emotion": "happy"\n  }' > speech.mp3
```

### Python示例

```python
import requests

url = "http://localhost:3000/v1/audio/speech"
headers = {
    "Content-Type": "application/json",
    # 如果启用了认证，添加以下行
    # "Authorization": "Bearer your-api-key"
}
payload = {
    "model": "tts-1",
    "input": "你好，这是一段测试文本。",
    "voice": "alloy",
    "response_format": "mp3",
    "speed": 1.0,
    "emotion": "happy"  # 可选的情感参数，支持: hate, happy, fear, surprise, angry, sad, neutral
}

response = requests.post(url, headers=headers, json=payload)

if response.status_code == 200:
    with open("speech.mp3", "wb") as f:
        f.write(response.content)
    print("音频文件已保存为 speech.mp3")
else:
    print(f"请求失败: {response.status_code}")
    print(response.json())
```

## 自定义修改

如果您需要修改目标TTS API的请求格式，请编辑`index.js`文件中的请求处理部分。您可能需要根据目标API的实际要求调整请求参数和处理逻辑。

## 注意事项

1. 请确保目标TTS API服务可用，并且您已经正确配置了API密钥、设备ID和令牌
2. 在生产环境中，建议启用API认证和请求限流功能
3. 根据您的使用情况调整缓存设置，以获得最佳性能
4. 如果您需要支持更多的语音类型，请在.env文件中添加相应的映射配置
5. 服务默认支持mp3、opus、aac、flac和wav等多种音频格式
6. 情感参数(emotion)支持的值包括：hate、happy、fear、surprise、angry、sad、neutral

## 常见错误及解决方案

### "文字转语音失败" 错误

这是最常见的错误，通常由以下原因导致：

1. **API密钥、设备ID或令牌不正确**
   - 解决方案：确保`.env`文件中的`TTS_API_KEY`、`HUDUNSOFT_DEVICE_ID`和`HUDUNSOFT_TOKEN`配置正确
   - 这些是连接hudunsoft TTS API的关键凭证，请务必使用有效的值

2. **网络连接问题**
   - 解决方案：检查您的服务器是否可以访问`TARGET_TTS_API_URL`
   - 确认没有防火墙或网络限制阻止了API请求

3. **文本内容问题**
   - 解决方案：尝试使用较短、简单的文本进行测试
   - 某些字符或内容可能不被目标API支持

4. **配置不匹配**
   - 解决方案：确保所有hudunsoft相关的配置参数都已正确设置
   - 特别是`HUDUNSOFT_X_PRODUCT`、`HUDUNSOFT_SOURCE`等参数需要与您的API密钥匹配

### 调试技巧

1. 将日志级别设置为debug：
   ```
   LOG_LEVEL=debug
   ```
   这将提供更详细的请求和响应信息，帮助您诊断问题

2. 检查完整的错误响应：
   更新后的代码会在错误响应中包含`details`字段，提供目标API返回的完整错误信息

3. 确认环境变量生效：
   服务启动时会在日志中显示当前使用的API配置，检查这些配置是否与您的预期一致

## 故障排除

1. 如果服务无法启动，请检查端口是否被占用
2. 如果API请求失败，请检查目标TTS API的URL和密钥是否正确
3. 启用debug日志级别可以获得更详细的错误信息
4. 检查日志文件（如果已配置）获取更多运行信息
5. 确保您使用的是正确的请求格式和参数

## 许可证

[MIT](LICENSE)