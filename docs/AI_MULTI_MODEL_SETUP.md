# AI Multi-Model Fallback System

## Overview

Chronify now supports **automatic fallback to multiple AI models** when one API key expires or has insufficient credits. This ensures your app continues to function even if one service is unavailable.

## Supported Models

| Model | Provider | Model ID | Status |
|-------|----------|----------|--------|
| **OpenAI** | OpenAI | `gpt-4o-mini` | ✅ Primary |
| **Claude** | Anthropic | `claude-3-5-sonnet-20241022` | ✅ Fallback 1 |
| **Gemini** | Google | `gemini-2.0-flash` | ✅ Fallback 2 |
| **DeepSeek** | DeepSeek | `deepseek-chat` | ✅ Fallback 3 |
| **Grok** | xAI | `grok-2-latest` | ✅ Fallback 4 |

## Fallback Flow

When a user requests AI features (generate goal, suggest task steps):

```
Try OpenAI
  ↓ (fails with expired credits)
Try Claude
  ↓ (fails)
Try Gemini
  ↓ (fails)
Try DeepSeek
  ↓ (fails)
Try Grok
  ↓ (all failed)
Show error: "Oops your AI credits are expired"
```

## Configuration

### Environment Variables

Update `backend/.env` with your API keys:

```bash
# OpenAI (gpt-4o-mini)
OPENAI_API_KEY=sk-proj-your-key-here

# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Google Gemini
GEMINI_API_KEY=AIzaSy-your-key-here

# DeepSeek
DEEPSEEK_API_KEY=sk-fed9-your-key-here

# Grok (xAI)
GROK_API_KEY=xai-your-key-here
```

### Notes on API Setup

1. **OpenAI**
   - Get key from: https://platform.openai.com/api-keys
   - Model: `gpt-4o-mini` (fast and cost-effective)
   
2. **Claude (Anthropic)**
   - Get key from: https://console.anthropic.com/
   - Model: `claude-3-5-sonnet-20241022` (latest, most capable)
   - Install SDK: `npm install @anthropic-ai/sdk`

3. **Gemini (Google)**
   - Get key from: https://aistudio.google.com/apikey
   - Model: `gemini-2.0-flash` (fast multimodal)
   - Install SDK: `npm install @google/generative-ai`

4. **DeepSeek**
   - Get key from: https://platform.deepseek.com/
   - Model: `deepseek-chat` (open-source alternative)
   - Uses REST API (no SDK needed)

5. **Grok (xAI)**
   - Get key from: https://console.x.ai/
   - Model: `grok-2-latest` (reasoning-focused)
   - Uses REST API (no SDK needed)

## Error Handling

### When All Credits are Expired

If ALL configured models fail due to invalid credentials or zero credits:

**HTTP Response:**
```json
{
  "message": "Oops your AI credits are expired",
  "error": "Oops your AI credits are expired"
}
```

**HTTP Status:** `402 Payment Required`

### Detection Logic

The system detects credential/quota errors by checking for:

- HTTP Status 401 (Unauthorized)
- HTTP Status 403 (Forbidden)
- HTTP Status 429 (Rate limited / Quota exceeded)
- HTTP Status 402 (Payment required)
- Error messages containing: "quota", "credit", "expired", "invalid", "unauthorized"
- Error codes: `insufficient_quota`, `invalid_api_key`, `auth_error`

### Partial Failures

If some models work and some fail:
- System will skip failed models and try the next one
- User gets a successful response (no error shown)
- No interruption to app functionality

## Frontend Implementation

### Showing Error to User

```typescript
try {
  const res = await fetch(`${API_BASE_URL}/ai/generate-goal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ prompt })
  });

  if (!res.ok) {
    const error = await res.json();
    
    // Show the error message from server
    if (error.message === 'Oops your AI credits are expired') {
      showAlert('Oops your AI credits are expired. Please add credits.', 'error');
    } else {
      showAlert(error.message, 'error');
    }
    return;
  }

  const data = await res.json();
  // ... handle success
} catch (error) {
  showAlert(error.message, 'error');
}
```

## Monitoring & Logging

### Backend Logs

The service logs which model was tried and which succeeded:

```
🤖 Trying OpenAI API with model: gpt-4o-mini
❌ OpenAI failed: Invalid API key
🤖 Trying Claude API
✅ Claude succeeded
✅ Goal parsed successfully with 5 tasks
```

### Console Output

- `✅ ModelName initialized` - Service is ready
- `⚠️  Warning: MODEL_API_KEY is not set` - Missing credential
- `🤖 Trying ModelName` - Attempting model
- `✅ ModelName succeeded` - Model worked
- `❌ ModelName failed` - Model didn't work, trying next

## Advanced: Adding New Models

To add another AI model:

1. **Install SDK** (if needed)
   ```bash
   npm install <model-sdk-package>
   ```

2. **Add initialization in aiService.js**
   ```javascript
   if (process.env.NEWMODEL_API_KEY) {
     models.newmodel = new NewModelClient(...);
   }
   ```

3. **Create call function**
   ```javascript
   const callNewModel = async (systemPrompt, userPrompt) => {
     // implementation
   };
   ```

4. **Add to fallback order**
   ```javascript
   const models_to_try = [
     { name: 'OpenAI', fn: callOpenAI },
     { name: 'Claude', fn: callClaude },
     { name: 'NewModel', fn: callNewModel }, // add here
     // ... rest
   ];
   ```

5. **Update .env.example**
   ```
   NEWMODEL_API_KEY=your-key-format
   ```

## Testing

### Test without API keys

Comment out all API keys to test error handling:

```bash
# In .env
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# ... etc
```

Run request → Get "Oops your AI credits are expired"

### Test single model

Set only one API key and disable others:

```bash
OPENAI_API_KEY=your-key
# ANTHROPIC_API_KEY=    (commented out)
# GEMINI_API_KEY=       (commented out)
```

### Monitor model selection

Check backend logs to see which model is being used and if fallbacks occur.

## Cost Optimization

Since the system tries models in order:

1. **Keep cheaper models first** for cost savings
2. **OpenAI gpt-4o-mini** is inexpensive (~$0.15 per million tokens)
3. **Claude** is more expensive but fallback for important requests
4. **Gemini/DeepSeek** offer free tiers or low cost
5. **Grok** has free tier via X.ai

## Troubleshooting

### Models not initializing

Check backend console for warnings:
```
⚠️  Warning: ANTHROPIC_API_KEY is not set
```

Add missing API key to `.env`

### All models failing

1. Check if API keys have remaining balance/credits:
   - OpenAI: https://platform.openai.com/account/usage/overview
   - Claude: https://console.anthropic.com/
   - Gemini: https://aistudio.google.com/
   - DeepSeek: https://platform.deepseek.com/
   - Grok: https://console.x.ai/

2. Verify API keys are correct (no typos)

3. Check backend logs for specific errors

4. Test API key directly using curl:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

## FAQ

**Q: Which model should I prioritize?**
A: OpenAI gpt-4o-mini is a good default. It's fast, cost-effective, and reliable.

**Q: Can I reorder the fallback sequence?**
A: Yes! Edit the `models_to_try` array in `aiService.js` (the `callAIModelWithFallback` function).

**Q: What if I only want to use one model?**
A: Just set that one API key and leave others blank. The system will only try available models.

**Q: Does fallback add latency?**
A: Only if the first model fails. If it succeeds, there's no additional delay. Failed models are skipped quickly (~1-2 seconds per failure).

**Q: Can I track which model was used?**
A: Yes, check the backend logs. Consider adding model name to successful responses in future updates.
