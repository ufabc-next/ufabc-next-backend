# WhatsApp API v2

A comprehensive WhatsApp API for group and community management using wppConnect, built with Fastify, BullMQ, and TypeScript.

## Features

- **Group Management**: Create, edit, and manage WhatsApp groups
- **Community Management**: Create and manage WhatsApp communities  
- **Message Operations**: Send messages and monitor conversations
- **Queue System**: Reliable job processing with BullMQ
- **Queue Dashboard**: Web interface for monitoring jobs via Bull Board
- **Type Safety**: Full TypeScript support with Zod validation
- **MVC Architecture**: Clean separation of concerns

## Tech Stack

- **Fastify**: Fast and efficient web framework
- **wppConnect**: WhatsApp Web automation
- **BullMQ**: Redis-based queue for job processing
- **Bull Board**: Web UI for queue management  
- **Zod v4**: Schema validation and type safety
- **TypeScript**: Type-safe development
- **Redis**: Queue storage and caching

## Quick Start

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Setup environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Redis** (required for queues):
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

4. **Run in development**:
   ```bash
   pnpm dev
   ```

5. **Build for production**:
   ```bash
   pnpm build
   pnpm start
   ```

## API Endpoints

### Groups
- `POST /api/v1/groups` - Create a new group
- `GET /api/v1/groups` - List all groups
- `GET /api/v1/groups/:id` - Get group details
- `PUT /api/v1/groups/:id` - Edit group
- `POST /api/v1/groups/:id/participants` - Add participants
- `DELETE /api/v1/groups/:id/participants` - Remove participants
- `POST /api/v1/groups/remove` - Leave and delete groups

### Messages  
- `POST /api/v1/messages` - Send a message
- `GET /api/v1/messages/:id` - Get messages from chat/group
- `POST /api/v1/messages/monitor/start` - Start message monitoring
- `POST /api/v1/messages/monitor/stop` - Stop message monitoring

### Jobs
- `GET /api/v1/jobs` - List all jobs
- `GET /api/v1/jobs/:id` - Get job details
- `POST /api/v1/jobs/:id/retry` - Retry failed job
- `DELETE /api/v1/jobs/:id` - Remove job

### Queue Dashboard
- Access Bull Board at `http://localhost:3000/admin/queues`
- Monitor job progress, retries, and failures
- Default credentials: admin/admin123

## Configuration

Key environment variables:

```env
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# WhatsApp
WHATSAPP_SESSION_NAME=whatsapp-session
WHATSAPP_HEADLESS=true
WHATSAPP_DEBUG_LOGS=false

# Bull Board Dashboard
BULL_BOARD_ENABLED=true
BULL_BOARD_PATH=/admin/queues
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=admin123
```

## Architecture

The project follows MVC pattern:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic for WhatsApp and queue operations
- **Models/Schemas**: Zod schemas for validation
- **Routes**: API endpoint definitions
- **Config**: Environment configuration with validation

## Development

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev

# Build TypeScript
pnpm build

# Start production server
pnpm start

# Type checking
pnpm type-check
```

## Leave Groups Flow

The `/api/v1/groups/remove` endpoint allows you to leave multiple WhatsApp groups that match a specific season/pattern. This is useful for cleaning up old course groups or batch removing groups.

### How It Works

1. **Search Phase**: The system searches through all WhatsApp groups for names containing the specified season pattern
2. **Filtering Phase**: Groups are filtered by the season pattern (case-insensitive) and limited by `numberOfGroups`
3. **Queue Phase**: Each matching group gets a separate job queued for leaving
4. **Execution Phase**: Jobs are processed asynchronously, leaving each group (and optionally deleting the chat)

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `season` | string | Yes | - | Search pattern to match group names (e.g., "2025:3" for third trimester of 2025) |
| `numberOfGroups` | number | No | 30 | Maximum number of groups to leave (limits the results) |
| `deleteGroups` | boolean | No | false | Whether to delete the chat after leaving the group |

### Example Request

```bash
curl --request POST \
  --url http://localhost:3000/api/v1/groups/remove \
  --header 'Content-Type: application/json' \
  --data '{
	"season":"2025:3", 
	"numberOfGroups": 2
}'
```

### Response (Success)

**Status Code**: `202 Accepted`

```json
{
  "success": true,
  "data": {
    "jobIds": ["1", "2"],
    "totalJobs": 2
  },
  "message": "2 leave group jobs queued successfully (one per group)"
}
```

### Response (No Groups Found)

**Status Code**: `202 Accepted`

```json
{
  "success": true,
  "data": {
    "jobIds": [],
    "totalJobs": 0
  },
  "message": "No groups found matching the criteria"
}
```

### Process Flow

```
┌─────────────────────────────────────────────────┐
│  1. API Request                                 │
│     POST /api/v1/groups/remove                  │
│     { season: "2025:3", numberOfGroups: 2 }     │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  2. Search All WhatsApp Groups                  │
│     - Fetch all groups from WhatsApp            │
│     - Filter by season pattern (case-insensitive)│
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  3. Apply Limits                                │
│     - Limit to numberOfGroups (max 2 in example)│
│     - Return matched groups: [group1, group2]   │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  4. Queue Jobs                                  │
│     - Create one job per group                  │
│     - Each job contains: groupId, groupName,    │
│       deleteGroup flag                          │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  5. Return Response                             │
│     - 202 Accepted with job IDs                 │
│     - Jobs process asynchronously in background │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  6. Background Processing (per job)             │
│     For each group:                             │
│     - Call client.leaveGroup(groupId)           │
│     - If deleteGroups=true: delete the chat     │
│     - Log success/failure                       │
└─────────────────────────────────────────────────┘
```

### Use Cases

#### 1. Remove Groups from Old Semester

Leave all groups from the third trimester of 2025:

```bash
curl --request POST \
  --url http://localhost:3000/api/v1/groups/remove \
  --header 'Content-Type: application/json' \
  --data '{
    "season": "2025:3"
}'
```

#### 2. Leave and Delete Limited Number of Groups

Leave and delete only 5 groups from a specific season:

```bash
curl --request POST \
  --url http://localhost:3000/api/v1/groups/remove \
  --header 'Content-Type: application/json' \
  --data '{
    "season": "2024:2",
    "numberOfGroups": 5,
    "deleteGroups": true
}'
```

#### 3. Test with Limited Groups

Test leaving just 2 groups without deleting:

```bash
curl --request POST \
  --url http://localhost:3000/api/v1/groups/remove \
  --header 'Content-Type: application/json' \
  --data '{
    "season": "2025:3",
    "numberOfGroups": 2,
    "deleteGroups": false
}'
```

### Important Notes

⚠️ **Warnings**:
- This operation is **irreversible** - you cannot rejoin groups without a new invitation
- Setting `deleteGroups: true` will also remove the chat history
- The operation is asynchronous - groups are left in the background
- Each group gets its own job, so failures are isolated (one failure won't stop others)

💡 **Best Practices**:
- Start with a small `numberOfGroups` value to test
- Use `deleteGroups: false` initially to avoid accidental data loss
- Check logs to verify which groups were affected
- The `season` parameter is case-insensitive and matches partial names

🔍 **Monitoring**:
- The response includes job IDs for tracking
- Check application logs for detailed execution status
- Each job processes independently in the background

### Group Name Matching

The season pattern matches group names that **contain** the search string (case-insensitive). For example:

- Season: `"2025:3"` matches:
  - `"BCC - Turma 2025:3"`
  - `"grupo de estudo 2025:3 - matematica"`
  - `"2025:3 - Project Team"`

- Season: `"2024"` matches:
  - `"Course 2024:1"`
  - `"2024:2 - Science"`
  - `"Study group 2024"`

## License

MIT License
