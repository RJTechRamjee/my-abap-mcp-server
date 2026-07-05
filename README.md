# AI-Powered ABAP Transport Analyzer - MCP Server

An intelligent Model Context Protocol (MCP) server that automates SAP transport code review, change analysis, and risk detection using the SAP ADT (ABAP Development Tools) REST API.

## Features

- **Transport Metadata Retrieval** - Fetch transport request details, owner, status, and object list
- **Automated Code Diff Analysis** - Generate unified diffs for ABAP objects (Classes, Reports, Interfaces, Function Modules)
- **Risk Detection** - Identify security risks, breaking changes, and code quality issues
- **Natural Language Summaries** - LLM-optimized structured analysis reports
- **Version Management** - Compare active code against previous versions from SAP
- **Error Handling** - Graceful handling of authorization, network, and parsing errors

## Prerequisites

- **Node.js** 18+ 
- **SAP S/4HANA** system with ADT enablement (SAP Note 2162659 or later)
- **SAP User Account** with authorizations:
  - `S_TRANSPRT` (Transport Management)
  - `S_DEVELOP` (ABAP Development)
- **Environment Variables** for SAP connection (see Configuration section)

## Installation

### 1. Clone or Download Project

```bash
git clone <repository-url>
cd my-abap-mcp-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update with your SAP system details:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SAP_HOST=https://your-sap-system.example.com:44300
SAP_CLIENT=100
SAP_USER=your_abap_user
SAP_PASSWORD=your_secure_password
```

### 4. Build TypeScript

```bash
npm run build
```

### 5. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## Configuration

### Environment Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `SAP_HOST` | Full URL to SAP S/4HANA system with ADT enabled | `https://saphana.corp.com:44300` | ✅ Yes |
| `SAP_CLIENT` | SAP client number | `100` | Optional (default: 100) |
| `SAP_USER` | ABAP user with S_TRANSPRT and S_DEVELOP auth | `DEVELOPER01` | ✅ Yes |
| `SAP_PASSWORD` | User password (store securely in vault for production) | `P@ssw0rd123` | ✅ Yes |

### SSL Certificate Handling

If your SAP system uses self-signed certificates, the server currently accepts them. For production, replace the HTTPS agent configuration in `src/index.ts`:

```typescript
// Current (development only)
httpsAgent: new https.Agent({ rejectUnauthorized: false })

// For production with trusted CA
httpsAgent: new https.Agent({ 
  ca: fs.readFileSync('/path/to/ca-bundle.pem')
})
```

## Available Tools

### 1. `get_transport_metadata`

Retrieves transport request header information and object list.

**Input:**
```json
{
  "transportId": "S4HK900123"
}
```

**Output:**
```json
{
  "transportId": "S4HK900123",
  "description": "Fix pricing calculation in SD module",
  "owner": "ABAPDEV",
  "status": "Released",
  "createdDate": "2026-06-28T10:30:00Z",
  "targetSystem": "PROD",
  "objectCount": 3
}
```

### 2. `analyze_transport_changes`

Performs detailed code diff analysis and risk assessment for all objects in a transport.

**Input:**
```json
{
  "transportId": "S4HK900123"
}
```

**Output:**
Markdown-formatted report including:
- Executive summary (objects analyzed, risk counts)
- Per-object change analysis with diffs
- Risk factor classification (HIGH/MEDIUM/LOW)
- Recommendations and mitigation steps

## Usage Examples

### Integrate with Claude or other LLM

```python
# Example with Claude API
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
  model="claude-3-5-sonnet-20241022",
  max_tokens=2048,
  tools=[
    {
      "name": "get_transport_metadata",
      "description": "Get transport request metadata",
      "input_schema": { ... }
    },
    {
      "name": "analyze_transport_changes",
      "description": "Analyze code changes in transport",
      "input_schema": { ... }
    }
  ],
  messages=[
    {
      "role": "user",
      "content": "What changed in transport S4HK900123?"
    }
  ]
)
```

### Direct CLI Usage (with jq)

```bash
# Test connection
curl -X POST http://localhost:3000/tools/get_transport_metadata \
  -H "Content-Type: application/json" \
  -d '{"transportId": "S4HK900123"}'
```

## Supported ABAP Object Types

The analyzer extracts and analyzes these ABAP object types:

- `CLAS` - ABAP Classes
- `PROG` - ABAP Reports/Programs  
- `INTF` - ABAP Interfaces
- `FUGR` - Function Groups
- `FUNC` - Function Modules
- `TABL` - Database Tables (schema changes)
- `VIEW` - Database Views
- `TYPE` - Type Definitions
- `ENPD` - Enhancement Points
- `ENHS` - Enhancements

## Risk Detection Rules

The analyzer identifies the following risk categories:

### HIGH Severity
- Missing AUTHORITY-CHECK for database modification operations (INSERT/UPDATE/DELETE)
- API breaking changes (visibility changed to PRIVATE)
- Modifications to standard SAP objects

### MEDIUM Severity
- Hardcoded numeric values or hex constants
- Significant code deletions (>20 lines, >70% of changes)
- New external method/function calls with potential dependency issues

### LOW Severity
- Code style improvements
- Comment updates

## API Error Responses

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| Authorization Failed | 401 | Invalid credentials or insufficient SAP authorization | Verify SAP user has S_TRANSPRT, S_DEVELOP authorities |
| Transport Not Found | 404 | Transport ID doesn't exist or is not accessible | Confirm transport ID is correct and released |
| XML Parse Error | 500 | ADT response format unexpected | Check SAP system release compatibility |
| Timeout | 504 | SAP backend unresponsive (>15s) | Check SAP system health, retry request |

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/mcp-server.test.ts

# Watch mode (auto-rerun on file changes)
npm test -- --watch
```

## Logging

The server writes debug logs to `debug.log` in the project root. This file is NOT part of the MCP protocol output to prevent corruption.

Monitor logs in real-time:

```bash
# On Windows PowerShell
Get-Content debug.log -Wait -Tail 20

# On macOS/Linux
tail -f debug.log
```

Logs include:
- Transport metadata parsing details
- XML structure analysis
- Object extraction trace
- HTTP request/response summaries

## Deployment

### Docker

Build and run in a Docker container:

```bash
docker build -t abap-mcp-server .
docker run -e SAP_HOST=https://... -e SAP_USER=... -e SAP_PASSWORD=... abap-mcp-server
```

### Kubernetes

Deploy to K8s cluster (see `k8s-deployment.yaml`):

```bash
kubectl apply -f k8s-deployment.yaml
```

### Cloud Platforms

- **AWS Lambda** - Package with Layers for node_modules
- **Azure Functions** - Use Node.js runtime
- **Google Cloud Run** - Containerize and deploy

## Development

### Project Structure

```
my-abap-mcp-server/
├── src/
│   └── index.ts                 # Main MCP server implementation
├── tests/
│   ├── mcp-server.test.ts       # TypeScript unit tests
│   └── mcp-server.test.js       # JavaScript unit tests
├── dist/                        # Compiled JavaScript (generated)
├── .env.example                 # Environment template
├── package.json                 # Dependencies & scripts
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Test runner configuration
├── nodemon.json                 # Auto-reload configuration
└── README.md                    # This file
```

### Build Commands

```bash
# Compile TypeScript to JavaScript
npm run build

# Start development server with auto-reload
npm run dev

# Run production server
npm start

# Run tests
npm test
```

### Code Style

- **Language**: TypeScript with strict mode enabled
- **Formatting**: Follows Node.js conventions
- **Linting**: (TODO: Add ESLint)

## Troubleshooting

### Connection Issues

**Problem:** "Missing SAP connection credentials in .env file"

**Solution:** 
- Verify `.env` file exists in project root
- Check all required variables are set: `SAP_HOST`, `SAP_USER`, `SAP_PASSWORD`
- Ensure no trailing spaces or quotes in `.env` values

**Problem:** "Authorization Failed: Invalid SAP credentials"

**Solution:**
- Verify SAP user password is correct
- Check user has S_TRANSPRT and S_DEVELOP authorizations
- In SAP, go to SUIM transaction and verify role assignments

**Problem:** "Transport Not Found: Transport ID does not exist"

**Solution:**
- Confirm transport ID is spelled correctly (case-sensitive in some systems)
- Verify transport is released (check status in SE10/SE09)
- Ensure user has authorization to view the transport

### Performance Issues

**Problem:** Analysis takes >5 seconds per object

**Solutions:**
- Check SAP system performance (SE30, SM50)
- Verify network latency to SAP system (ping test)
- Consider implementing caching for frequently accessed transports
- Analyze smaller transports first (split large ones)

### XML Parsing Errors

**Problem:** "Failed to parse XML response for transport"

**Solution:**
- Check `debug.log` for the actual XML structure returned
- Verify SAP system release (S/4HANA 2020 or later recommended)
- Review SAP Note 2162659 for ADT configuration

## Security Considerations

⚠️ **Important Security Notes:**

1. **Credential Management**
   - Never commit `.env` file to version control
   - Use environment variables or secret vaults in production
   - Rotate SAP credentials regularly
   - Use OAuth2 if available (future enhancement)

2. **Data Privacy**
   - ABAP source code retrieved may contain sensitive business logic
   - Ensure logs are protected with appropriate access controls
   - Only share diffs with authorized personnel
   - Consider data classification policies before transmission

3. **Network Security**
   - Always use HTTPS for SAP connections
   - Validate SSL certificates in production (not disabled)
   - Firewall restrict access to MCP server endpoints
   - Implement rate limiting for production use

4. **Authorization**
   - Audit user access to transports regularly
   - Limit MCP server access to authorized LLM agents
   - Monitor for suspicious transport analysis patterns
   - Log all tool invocations for compliance

## Roadmap

- [ ] Support for multiple SAP systems (multi-tenant)
- [ ] OAuth2 authentication support
- [ ] Transport comparison (side-by-side analysis)
- [ ] Caching layer for performance optimization
- [ ] Advanced risk rules (custom, configurable)
- [ ] Batch transport analysis
- [ ] HTML/PDF report generation
- [ ] Slack/Teams integration for alerts
- [ ] Kubernetes Helm charts
- [ ] Performance metrics & monitoring (Prometheus)

## Support & Contribution

- **Issues**: Report bugs via GitHub Issues
- **Questions**: Open Discussions tab
- **Contributions**: See CONTRIBUTING.md for guidelines
- **License**: ISC

## References

- [SAP ADT Developer Guide](https://help.sap.com/docs/ABAP_ADT)
- [MCP Specification](https://modelcontextprotocol.io/)
- [SAP S/4HANA Release Notes](https://help.sap.com/docs/SAP_S4HANA)
- [ABAP Development Tools](https://tools.hana.ondemand.com/)

---

**Last Updated:** 2026-07-05  
**Version:** 1.0.0  
**Maintainer:** ABAP Development Team
