# i18n Service - Internationalization for Surebet Detector

Multi-language support microservice providing translations, language management, user preferences, and AI-powered auto-translation.

## Features

- **Multi-language Support**: English, French, Spanish, German, Italian, Portuguese, Dutch
- **Namespace Organization**: Translations organized by feature (common, auth, dashboard, opportunities, etc.)
- **User Preferences**: Per-user language settings with auto-detection
- **Caching**: In-memory caching for fast translation lookups
- **Missing Translation Detection**: Identify untranslated keys
- **Bulk Import**: Import translations via API
- **AI Auto-Translation**: DeepL + Google Translate integration with human review workflow

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Configure API keys for AI translation (optional)
# DEEPL_API_KEY=your_key_here
# GOOGLE_TRANSLATE_API_KEY=your_key_here

# Start MongoDB (if using docker-compose)
docker-compose up -d mongodb

# Seed initial translations
npm run seed

# Start service
npm start
```

## API Endpoints

### Languages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/languages` | List all languages |
| GET | `/api/languages/:code` | Get language details |
| POST | `/api/languages` | Create language |
| PUT | `/api/languages/:code` | Update language |
| DELETE | `/api/languages/:code` | Delete language |
| POST | `/api/languages/initialize` | Initialize default languages |
| GET | `/api/languages/report/completion` | Translation completion report |

### Translations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/translations/:language/:namespace` | Get namespace translations |
| GET | `/api/translations/:language` | Get multiple namespaces |
| GET | `/api/translations/single/:language` | Get single translation |
| POST | `/api/translations` | Create/update translation |
| POST | `/api/translations/bulk` | Bulk import translations |
| GET | `/api/translations/search/all` | Search translations |
| GET | `/api/translations/missing/:language` | Get missing translations |
| GET | `/api/translations/stats/overview` | Translation statistics |

### User Preferences

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/preferences/:userId` | Get user preferences |
| PUT | `/api/preferences/:userId` | Update preferences |
| POST | `/api/preferences/:userId/language` | Set language |
| POST | `/api/preferences/:userId/auto-detect` | Toggle auto-detect |
| GET | `/api/preferences/:userId/effective-language` | Get effective language |

### AI Translation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai-translate/translate` | Translate single text |
| POST | `/api/ai-translate/batch` | Batch translate texts |
| POST | `/api/ai-translate/auto-translate` | Auto-translate missing keys |
| GET | `/api/ai-translate/pending-review` | Get translations pending review |
| POST | `/api/ai-translate/review/:id` | Approve/reject translation |
| POST | `/api/ai-translate/bulk-review` | Bulk approve/reject |
| GET | `/api/ai-translate/stats/quality` | Translation quality statistics |
| GET | `/api/ai-translate/suggest/:id` | Get AI improvement suggestion |
| GET | `/api/ai-translate/providers` | Get provider status |

## Usage Examples

### Get translations for a namespace

```bash
curl http://localhost:3007/api/translations/fr/common
```

### Get multiple namespaces

```bash
curl "http://localhost:3007/api/translations/fr?namespaces=common,opportunities,betting"
```

### Set user language

```bash
curl -X POST http://localhost:3007/api/preferences/user123/language \
  -H "Content-Type: application/json" \
  -d '{"language": "fr"}'
```

### Bulk import translations

```bash
curl -X POST http://localhost:3007/api/translations/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "language": "it",
    "namespace": "common",
    "translations": [
      {"key": "action.save", "value": "Salva"},
      {"key": "action.cancel", "value": "Annulla"}
    ]
  }'
```

### AI Auto-Translate Missing Keys

```bash
curl -X POST http://localhost:3007/api/ai-translate/auto-translate \
  -H "Content-Type: application/json" \
  -d '{
    "targetLang": "fr",
    "namespace": "common",
    "dryRun": false,
    "reviewRequired": true
  }'
```

### Review a Translation

```bash
curl -X POST http://localhost:3007/api/ai-translate/review/65abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "reviewerId": "admin",
    "notes": "Looks good!"
  }'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3007 | Service port |
| `MONGODB_URI` | mongodb://localhost:27017/surebet_i18n | MongoDB connection |
| `SUPPORTED_LANGUAGES` | en,fr,es,de,it,pt,nl | Comma-separated list |
| `DEFAULT_LANGUAGE` | en | Fallback language |
| `TRANSLATION_CACHE_TTL` | 3600 | Cache TTL in seconds |
| `DEEPL_API_KEY` | - | DeepL API key for AI translation |
| `GOOGLE_TRANSLATE_API_KEY` | - | Google Translate API key (fallback) |

## AI Translation

The service supports automatic translation using DeepL (primary) and Google Translate (fallback).

### Features

- **Auto-Translate Missing Keys**: Automatically translate all missing keys for a language
- **Human Review Workflow**: Translations can be marked for review before going live
- **Quality Statistics**: Track approval rates and translation quality
- **Bulk Review**: Approve or reject multiple translations at once
- **Provider Fallback**: If DeepL fails, automatically falls back to Google Translate

### Admin UI

Access the AI translation review interface at:
```
http://your-domain/ai-translation-review.html
```

Features:
- View pending translations
- Side-by-side original vs AI translation
- Approve/reject with one click
- Bulk actions
- Auto-translate missing keys
- Quality statistics dashboard

### Translation Metadata

AI-translated entries include metadata:
```json
{
  "metadata": {
    "source": "ai-translation",
    "provider": "deepl",
    "autoTranslated": true,
    "reviewRequired": true,
    "reviewStatus": "pending",
    "originalText": "Save",
    "translatedAt": "2026-02-18T06:00:00Z",
    "sourceLanguage": "en"
  }
}
```

## Frontend Integration

```javascript
// React example with i18next
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Fetch translations from service
const loadTranslations = async (language, namespaces) => {
  const response = await fetch(
    `http://localhost:3007/api/translations/${language}?namespaces=${namespaces.join(',')}`
  );
  const data = await response.json();
  return data.translations;
};

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'opportunities', 'betting'],
    defaultNS: 'common',
    resources: {}, // Load from API
  });
```

## Docker

```yaml
services:
  i18n-service:
    build: ./microservices/i18n-service
    ports:
      - "3007:3007"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/surebet_i18n
      - DEEPL_API_KEY=${DEEPL_API_KEY}
      - GOOGLE_TRANSLATE_API_KEY=${GOOGLE_TRANSLATE_API_KEY}
    depends_on:
      - mongodb
```
