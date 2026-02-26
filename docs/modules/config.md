# Config Module

The Config module handles configuration schema definition and validation for the ZTM Chat plugin.

## Purpose

- Define plugin configuration schema
- Validate configuration at runtime
- Provide default values
- Support configuration hints for UI

## Key Exports

| Export | Description |
|--------|-------------|
| `PluginConfig` | Main plugin configuration type |
| `schema` | TypeBox configuration schema |
| `validateConfig` | Validate configuration |
| `getDefaultConfig` | Get default configuration |
| `mergeConfig` | Merge configurations |
| `ExtendedZTMChatConfig` | Extended configuration type |
| `ZTMChatConfigValidation` | Validation result type |
| `ConfigValidationError` | Validation error type |

## Configuration Schema

The configuration uses TypeBox for runtime type validation:

```typescript
import { schema, validateConfig } from './config/index.js';

const result = validateConfig(userConfig);
if (!result.success) {
  console.error(result.error);
}
```

## Features

- **Schema Validation**: Runtime type checking with TypeBox
- **Default Values**: Sensible defaults for all options
- **Error Messages**: Detailed validation error reporting
- **UI Hints**: Configuration hints for user interfaces

## Source Files

- `src/config/schema.ts` - Configuration schema definition
- `src/config/validation.ts` - Validation logic
- `src/config/defaults.ts` - Default values

## Usage Example

```typescript
import { schema, validateConfig, getDefaultConfig } from './config/index.js';

// Validate user configuration
const validation = validateConfig(userConfig);
if (validation.success) {
  const config = validation.value;
}

// Get defaults
const defaults = getDefaultConfig();
```

## Related Documentation

- [ADR-020 - Configuration Schema Validation](../adr/ADR-020-configuration-schema-validation.md)
- [User Guide - Configuration](../user-guide.md)
- [API Reference - Config Types](../api/types.md#configuration)
