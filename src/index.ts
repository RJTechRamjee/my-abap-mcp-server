import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { parseStringPromise } from 'xml2js';
import { createPatch } from 'diff';
import * as https from 'https';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// ============================================================================
// LOGGING & DIAGNOSTICS
// ============================================================================

const debugLogFile = path.join(process.cwd(), 'debug.log');

interface LogLevel {
  ERROR: 'ERROR';
  WARN: 'WARN';
  INFO: 'INFO';
  DEBUG: 'DEBUG';
}

const LOG_LEVELS: LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

function structuredLog(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };
  const logLine = `[${timestamp}] [${level}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(debugLogFile, logLine);
  } catch (e) {
    // Silently fail if can't write
  }
}

function debugLog(message: string) {
  structuredLog(LOG_LEVELS.DEBUG, message);
}

function errorLog(message: string, error?: any) {
  structuredLog(LOG_LEVELS.ERROR, message, error);
}

function warnLog(message: string, data?: any) {
  structuredLog(LOG_LEVELS.WARN, message, data);
}

// ============================================================================
// INPUT VALIDATION & SANITIZATION
// ============================================================================

// Valid transport ID pattern: alphanumeric, typically 10-12 chars (e.g., S4HK900123, DEVK123456)
const TRANSPORT_ID_REGEX = /^[A-Za-z0-9]{1,20}$/;
const MAX_TRANSPORT_ID_LENGTH = 20;

function validateTransportId(transportId: string): { valid: boolean; error?: string } {
  if (!transportId) {
    return { valid: false, error: 'Transport ID cannot be empty' };
  }

  if (typeof transportId !== 'string') {
    return { valid: false, error: 'Transport ID must be a string' };
  }

  const trimmedId = transportId.trim();

  if (trimmedId.length === 0) {
    return { valid: false, error: 'Transport ID cannot be whitespace only' };
  }

  if (trimmedId.length > MAX_TRANSPORT_ID_LENGTH) {
    return { valid: false, error: `Transport ID exceeds maximum length of ${MAX_TRANSPORT_ID_LENGTH}` };
  }

  if (!TRANSPORT_ID_REGEX.test(trimmedId)) {
    return { valid: false, error: 'Transport ID contains invalid characters. Use only alphanumeric characters.' };
  }

  return { valid: true };
}

function sanitizeTransportId(transportId: string): string {
  return transportId.trim().toUpperCase();
}

// ============================================================================
// DEBUG LOGGING (ORIGINAL FUNCTION PRESERVED)
// ============================================================================

// Load environment variables
const SAP_HOST = process.env.SAP_HOST;
const SAP_CLIENT = process.env.SAP_CLIENT || '100';
const SAP_USER = process.env.SAP_USER;
const SAP_PASSWORD = process.env.SAP_PASSWORD;

// ============================================================================
// STARTUP VALIDATION
// ============================================================================

function validateStartupConfiguration(): string[] {
  const errors: string[] = [];

  if (!SAP_HOST) {
    errors.push('SAP_HOST is not set. Required: Full URL to SAP system (e.g., https://sap.company.com:44300)');
  } else if (!SAP_HOST.startsWith('http://') && !SAP_HOST.startsWith('https://')) {
    errors.push('SAP_HOST must start with http:// or https://');
  }

  if (!SAP_USER) {
    errors.push('SAP_USER is not set. Required: ABAP user with S_TRANSPRT and S_DEVELOP authorizations');
  }

  if (!SAP_PASSWORD) {
    errors.push('SAP_PASSWORD is not set. Required: Password for SAP user account');
  }

  if (SAP_CLIENT && isNaN(parseInt(SAP_CLIENT))) {
    errors.push('SAP_CLIENT must be a numeric value (0-999)');
  }

  return errors;
}

const startupErrors = validateStartupConfiguration();
if (startupErrors.length > 0) {
  console.error('\n❌ STARTUP CONFIGURATION ERROR\n');
  console.error('Missing or invalid environment variables:\n');
  startupErrors.forEach((error, index) => {
    console.error(`${index + 1}. ${error}`);
  });
  console.error('\n📋 SETUP INSTRUCTIONS:\n');
  console.error('1. Copy .env.example to .env');
  console.error('2. Edit .env and fill in all required values');
  console.error('3. Required SAP user authorizations:');
  console.error('   - S_TRANSPRT: Transport Management');
  console.error('   - S_DEVELOP: ABAP Development');
  console.error('\n💡 For more details, see README.md\n');
  process.exit(1);
}

debugLog('='.repeat(80));
debugLog('MCP SERVER STARTUP - Configuration validated');
debugLog(`SAP Host: ${SAP_HOST}`);
debugLog(`SAP Client: ${SAP_CLIENT}`);
debugLog(`SAP User: ${SAP_USER}`);
debugLog('='.repeat(80));

// Instantiate HTTP Client (Defaults are isolated to auth to prevent header pollution)
const adtClient: AxiosInstance = axios.create({
  baseURL: `${SAP_HOST}/sap/bc/adt`,
  auth: {
    username: SAP_USER!,
    password: SAP_PASSWORD!
  },
  headers: {
    'sap-client': SAP_CLIENT
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 15000  // 15 second timeout for all requests
});

interface ABAPObject {
  pgmid: string;
  type: string;
  name: string;
}

interface TransportMetadata {
  transportId: string;
  description: string;
  owner: string;
  status: string;
  createdDate?: string;
  targetSystem?: string;
  objectCount: number;
}

interface CodeDiffAnalysis {
  objectType: string;
  objectName: string;
  hasChanges: boolean;
  diff: string;
  riskFactors: RiskFactor[];
  summaryOfChanges: string;
}

interface RiskFactor {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  finding: string;
  lines?: number[];
}

// Helper to recursively find objects in parsed XML tree (robust against root name/tag differences)
function findXmlObjects(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  let found: any[] = [];
  
  if (node['tm:object']) {
    if (Array.isArray(node['tm:object'])) {
      found.push(...node['tm:object']);
    } else {
      found.push(node['tm:object']);
    }
  }
  
  // Also check for unprefixed version
  if (node['object']) {
    if (Array.isArray(node['object'])) {
      found.push(...node['object']);
    } else {
      found.push(node['object']);
    }
  }
  
  for (const key of Object.keys(node)) {
    if (key !== 'tm:object' && key !== 'object' && key !== '$') {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          found.push(...findXmlObjects(item));
        }
      } else {
        found.push(...findXmlObjects(child));
      }
    }
  }
  return found;
}

// FR-1: Extract transport metadata from XML response
async function extractTransportMetadata(transportId: string, xmlData: string): Promise<TransportMetadata> {
  try {
    const parsed = await parseStringPromise(xmlData);
    
    // Navigate through the XML structure - ADT uses various root elements
    let transportNode = parsed['tm:transportRequest'] || parsed['asx:abap'] || parsed;
    
    // Helper to safely get text content from XML node
    const getTextContent = (node: any): string => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.length > 0 ? getTextContent(node[0]) : '';
      if (node['_']) return node['_'];
      if (node['$text']) return node['$text'];
      return '';
    };

    // Helper to recursively find element by tag name
    const findElement = (obj: any, tagName: string): any => {
      if (!obj || typeof obj !== 'object') return null;
      
      // Direct match
      if (obj[tagName]) return obj[tagName];
      
      // Search in arrays and nested objects
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findElement(item, tagName);
            if (found) return found;
          }
        } else if (typeof value === 'object') {
          const found = findElement(value, tagName);
          if (found) return found;
        }
      }
      return null;
    };

    // Extract metadata from transport node
    const shortDesc = findElement(transportNode, 'tm:shortDescription') || 
                      findElement(transportNode, 'shortDescription');
    const userElem = findElement(transportNode, 'tm:user') || 
                     findElement(transportNode, 'user');
    const statusElem = findElement(transportNode, 'tm:status') || 
                       findElement(transportNode, 'status');
    const createdElem = findElement(transportNode, 'tm:createdDate') || 
                        findElement(transportNode, 'createdDate');
    const targetElem = findElement(transportNode, 'tm:targetSystem') || 
                       findElement(transportNode, 'targetSystem');

    return {
      transportId,
      description: getTextContent(shortDesc) || 'No description available',
      owner: getTextContent(userElem) || 'Unknown',
      status: getTextContent(statusElem) || 'Unknown',
      createdDate: getTextContent(createdElem) || undefined,
      targetSystem: getTextContent(targetElem) || undefined,
      objectCount: 0
    };
  } catch (error) {
    console.error(`Metadata extraction error for ${transportId}:`, error);
    return {
      transportId,
      description: 'Unable to parse metadata',
      owner: 'Unknown',
      status: 'Unknown',
      objectCount: 0
    };
  }
}

// FR-3: Analyze code diff for risks and generate summary
function analyzeCodeDiffForRisks(diff: string, currentCode: string, previousCode: string, objectType: string): { risks: RiskFactor[]; summary: string } {
  const risks: RiskFactor[] = [];
  const changeLines = diff.split('\n').filter(line => line.startsWith('+') || line.startsWith('-'));
  
  // Risk Detection Logic
  
  // 1. Check for hardcoded values
  if (/['"].*\d{10,}['"]|0x[0-9A-Fa-f]+/.test(currentCode) && !previousCode.includes(currentCode)) {
    risks.push({
      severity: 'MEDIUM',
      category: 'Hardcoded Values',
      finding: 'Potential hardcoded numeric values or hex constants detected in code changes.',
      lines: [1]
    });
  }

  // 2. Check for missing authority checks (ABAP-specific)
  if (objectType === 'CLAS' || objectType === 'PROG' || objectType === 'FUGR') {
    const addedLines = diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
    const hasAuthCheck = addedLines.some(line => /AUTHORITY-CHECK|CHECK.*AUTHORITY|IF.*AUTHORIZED/.test(line));
    const hasDatabaseModify = addedLines.some(line => /INSERT|UPDATE|DELETE|MODIFY.*INTO|APPEND.*TO|CLEAR/.test(line));
    
    if (hasDatabaseModify && !hasAuthCheck) {
      risks.push({
        severity: 'HIGH',
        category: 'Security - Missing Authority Check',
        finding: 'Database modification operations (INSERT/UPDATE/DELETE) detected without corresponding AUTHORITY-CHECK',
        lines: []
      });
    }
  }

  // 3. Check for breaking modifications to standard code
  if (currentCode.includes('PRIVATE') && !previousCode.includes('PRIVATE')) {
    risks.push({
      severity: 'HIGH',
      category: 'API Breaking Change',
      finding: 'Method or attribute visibility changed to PRIVATE, potentially breaking existing consumers',
      lines: []
    });
  }

  // 4. Check for large deletions (potential logic removal)
  const deletedLines = diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---'));
  if (deletedLines.length > 20 && deletedLines.length > changeLines.length * 0.7) {
    risks.push({
      severity: 'MEDIUM',
      category: 'Significant Code Deletion',
      finding: `Large section of code removed (${deletedLines.length} lines deleted). Verify if this was intentional.`,
      lines: []
    });
  }

  // 5. Check for new external calls or modifications to existing ones
  const addedExternalCalls = diff.split('\n').filter(line => 
    line.startsWith('+') && /CALL.*METHOD|CALL.*FUNCTION|CALL.*BADI|CALL.*CLASS/.test(line)
  );
  if (addedExternalCalls.length > 0) {
    risks.push({
      severity: 'MEDIUM',
      category: 'External Dependencies',
      finding: `New external method/function calls introduced (${addedExternalCalls.length} calls). Verify dependencies exist in target system.`,
      lines: []
    });
  }

  // Generate summary
  let summary = 'Code analysis complete. ';
  if (risks.length === 0) {
    summary += 'No significant risks detected.';
  } else {
    const highRisks = risks.filter(r => r.severity === 'HIGH');
    const mediumRisks = risks.filter(r => r.severity === 'MEDIUM');
    summary += `${highRisks.length} high-risk issue(s) and ${mediumRisks.length} medium-risk issue(s) identified.`;
  }

  return { risks, summary };
}

// 1. Fetch transport objects from SAP (E071 lookup)
async function getObjectsFromTransport(transportId: string): Promise<ABAPObject[]> {
  // S/4HANA accepts only one exact media type at a time. We try them sequentially to bypass the ABAP parser bug.
  const mediaTypes = [
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'application/vnd.sap.adt.transportorganizertree.v1+xml'
  ];

  let xmlData = '';
  let lastError: any = null;

  for (const mediaType of mediaTypes) {
    try {
      const response = await adtClient.get(`/cts/transportrequests/${transportId}`, {
        headers: {
          'Accept': mediaType
        }
      });
      xmlData = response.data;
      lastError = null; // Clear if successful
      break; // Success! Break out of fallback loop
    } catch (error: any) {
      lastError = error;
      // If it is a 406 Not Acceptable, retry with the next media type
      if (error.response?.status === 406) {
        continue;
      }
      // If it is another HTTP error (such as 401 Unauthorized), fail immediately
      throw error;
    }
  }

  if (lastError) {
    throw new Error(`Failed to query transport ${transportId} with ADT endpoints (Status: ${lastError.response?.status || 'network error'})`);
  }

  try {
    const parsed = await parseStringPromise(xmlData);
    debugLog(`Parsed XML structure keys: ${Object.keys(parsed).join(', ')}`);
    debugLog(`Full parsed object: ${JSON.stringify(parsed, null, 2).substring(0, 1500)}`);
    
    const objects: ABAPObject[] = [];
    
    // Recursively extract objects from parsed XML structure
    const tmObjects = findXmlObjects(parsed);
    debugLog(`Found ${tmObjects.length} objects in XML`);
    
    // ABAP object types that have source code and can be analyzed
    const codeObjectTypes = ['CLAS', 'PROG', 'FUGR', 'INTF', 'FUNC', 'TABL', 'VIEW', 'TYPE', 'ENPD', 'ENHS'];
    
    for (const obj of tmObjects) {
      if (obj && obj['$']) {
        const pgmid = obj['$']['tm:pgmid'] || obj['$']['pgmid'] || '';
        const type = obj['$']['tm:type'] || obj['$']['type'] || '';
        const name = obj['$']['tm:name'] || obj['$']['name'] || '';
        
        debugLog(`Object found - Type: ${type}, Name: ${name}, PGMID: ${pgmid}`);
        
        if (codeObjectTypes.includes(type) && name) {
          objects.push({ pgmid, type, name });
        }
      }
    }
    
    debugLog(`Transport ${transportId}: Found ${objects.length} code objects - ${objects.map(o => `${o.type}:${o.name}`).join(', ')}`);
    return objects;
  } catch (parseErr: any) {
    debugLog(`XML parsing error: ${parseErr.message}`);
    throw new Error(`Failed to parse XML response for transport ${transportId}: ${parseErr.message}`);
  }
}

// FR-1 Implementation: Fetch Transport Metadata
async function getTransportMetadata(transportId: string): Promise<TransportMetadata & { rawXml?: string }> {
  const mediaTypes = [
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'application/vnd.sap.adt.transportorganizertree.v1+xml'
  ];

  let xmlData = '';
  let lastError: any = null;
  let usedMediaType = '';

  for (const mediaType of mediaTypes) {
    try {
      const response = await adtClient.get(`/cts/transportrequests/${transportId}`, {
        headers: {
          'Accept': mediaType
        }
      });
      xmlData = response.data;
      usedMediaType = mediaType;
      lastError = null;
      
      // DEBUG: Log the actual XML response for inspection
      debugLog(`ADT Response for ${transportId} (${mediaType}): ${xmlData.substring(0, 2000)}`);
      debugLog(`Full response length: ${xmlData.length} characters`);
      break;
    } catch (error: any) {
      lastError = error;
      if (error.response?.status === 406) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw new Error(`Transport ${transportId} not found or access denied (Status: ${lastError.response?.status || 'network error'})`);
  }

  // Extract metadata using async XML parser
  const metadata = await extractTransportMetadata(transportId, xmlData);
  
  // Store raw XML for response
  (metadata as any).rawXml = xmlData;
  (metadata as any).mediaType = usedMediaType;
  
  // Don't count objects here - just return metadata quickly
  // Object counting will happen separately when analyzing transport
  metadata.objectCount = 0;

  return metadata as any;
}

// 2. Fetch active source code from SAP
async function getObjectSource(obj: ABAPObject): Promise<string> {
  let endpoint = '';
  const objNameLower = obj.name.toLowerCase();

  switch (obj.type) {
    case 'CLAS':
      endpoint = `/oo/classes/${objNameLower}/source/main`;
      break;
    case 'PROG':
      endpoint = `/programs/programs/${objNameLower}/source`;
      break;
    case 'FUGR':
      endpoint = `/programs/includes/${objNameLower}/source`;
      break;
    case 'INTF':
      endpoint = `/oo/interfaces/${objNameLower}/source/main`;
      break;
    default:
      return '';
  }

  try {
    const response = await adtClient.get(endpoint, {
      headers: { 'Accept': 'text/plain' }
    });
    return response.data;
  } catch (error: any) {
    return `* Error reading code for ${obj.type} ${obj.name}: ${error.message}`;
  }
}

// 3. Fetch previous source code version from SAP
async function getPreviousObjectSource(obj: ABAPObject): Promise<string> {
  let baseEndpoint = '';
  const objNameLower = obj.name.toLowerCase();

  switch (obj.type) {
    case 'CLAS':
      baseEndpoint = `/oo/classes/${objNameLower}/source/main`;
      break;
    case 'PROG':
      baseEndpoint = `/programs/programs/${objNameLower}/source`;
      break;
    case 'INTF':
      baseEndpoint = `/oo/interfaces/${objNameLower}/source/main`;
      break;
    default:
      return '';
  }

  try {
    const versionResponse = await adtClient.get(`${baseEndpoint}/versions`, {
      headers: { 'Accept': 'application/xml' }
    });
    const parsedVersions = await parseStringPromise(versionResponse.data);
    
    const versionsList = parsedVersions['ver:versions']?.['ver:version'] || [];
    
    if (versionsList.length <= 1) {
      return '';
    }

    const previousVersionId = versionsList[1]['$']['ver:id']; 

    const historicalResponse = await adtClient.get(`${baseEndpoint}/versions/${previousVersionId}`, {
      headers: { 'Accept': 'text/plain' }
    });
    
    return historicalResponse.data;
  } catch (error) {
    return '';
  }
}

// 4. Initialize MCP Server instance
const mcpServer = new Server(
  { name: 'sap-adt-code-reviewer', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Define MCP Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_transport_metadata',
        description: 'Retrieves transport request metadata including description, owner, status, and complete list of modified objects. Implements FR-1 requirements.',
        inputSchema: {
          type: 'object',
          properties: {
            transportId: {
              type: 'string',
              description: 'The Workbench Transport Request number (e.g., DEVK900123)'
            }
          },
          required: ['transportId']
        }
      },
      {
        name: 'analyze_transport_changes',
        description: 'Performs detailed analysis of transport changes: generates unified diffs for all objects, detects risk factors (missing auth checks, hardcoded values, breaking changes), and provides LLM-optimized structured analysis. Implements FR-2 and FR-3 requirements.',
        inputSchema: {
          type: 'object',
          properties: {
            transportId: {
              type: 'string',
              description: 'The Workbench Transport Request number (e.g., DEVK900123)'
            }
          },
          required: ['transportId']
        }
      }
    ]
  };
});

// Define MCP Tool execution
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const { transportId } = request.params.arguments as { transportId: string };

  // Validate input
  const validationResult = validateTransportId(transportId);
  if (!validationResult.valid) {
    errorLog(`Invalid transport ID provided: ${transportId}`, { error: validationResult.error });
    return {
      content: [{ 
        type: 'text', 
        text: `❌ **Input Validation Error**\n\n**Transport ID:** "${transportId}"\n\n**Error:** ${validationResult.error}\n\n**Expected Format:**\n- Alphanumeric characters only (A-Z, 0-9)\n- Length: 1-${MAX_TRANSPORT_ID_LENGTH} characters\n- Examples: S4HK900123, DEVK900456, TR123456\n\n**Please provide a valid transport ID and try again.**` 
      }],
      isError: true
    };
  }

  const sanitizedTransportId = sanitizeTransportId(transportId);
  debugLog(`=== TOOL CALLED: ${name} with transport ${sanitizedTransportId} ===`);

  try {
    // FR-1: Get Transport Metadata
    if (name === 'get_transport_metadata') {
      debugLog(`Fetching metadata for transport: ${sanitizedTransportId}`);
      const metadata = await getTransportMetadata(sanitizedTransportId);
      const metadataJson = JSON.stringify(metadata, null, 2);
      debugLog(`Successfully retrieved metadata for ${sanitizedTransportId}`);
      return {
        content: [{ 
          type: 'text', 
          text: `# Transport Metadata - ${sanitizedTransportId}\n\n${metadataJson}`
        }]
      };
    }

    // FR-2 & FR-3: Analyze Transport Changes with Risk Assessment
    if (name === 'analyze_transport_changes') {
      debugLog(`Starting analysis for transport: ${sanitizedTransportId}`);
      let objects: ABAPObject[] = [];
      let metadata: TransportMetadata;
      
      try {
        debugLog(`Retrieving metadata for ${sanitizedTransportId}`);
        metadata = await getTransportMetadata(sanitizedTransportId);
      } catch (err: any) {
        errorLog(`Failed to retrieve transport metadata`, { transportId: sanitizedTransportId, error: err.message });
        
        // Provide detailed error diagnostics
        const statusCode = err.response?.status;
        let userMessage = '';

        if (statusCode === 401) {
          userMessage = `**Authorization Failed (401)**\n\nPossible causes:\n- Invalid SAP credentials\n- Insufficient user authorizations (missing S_TRANSPRT or S_DEVELOP)\n- SAP user account locked or expired\n\n**Actions to take:**\n1. Verify SAP username and password in .env\n2. Check user has S_TRANSPRT and S_DEVELOP roles in SAP\n3. Run transaction SUIM to verify role assignments\n4. Contact your SAP administrator if issues persist`;
        } else if (statusCode === 404) {
          userMessage = `**Transport Not Found (404)**\n\nThe transport ID "${sanitizedTransportId}" does not exist or is not accessible.\n\n**Verification steps:**\n1. Confirm the transport ID is correct (case-sensitive in some systems)\n2. Check if transport is released (use SAP transaction SE10 or SE09)\n3. Verify user has authorization to view this transport\n4. Try a different transport ID to test connectivity\n\n**Transport Status Check:**\n- Released transports: Can be imported\n- Modifiable transports: Still in development\n- Imported transports: Already in target system`;
        } else if (statusCode >= 500) {
          userMessage = `**SAP Backend Error (${statusCode})**\n\nThe SAP system returned a server error. This could indicate:\n- SAP system is under maintenance\n- ADT service is temporarily unavailable\n- Database connectivity issues\n\n**Recommended actions:**\n1. Wait a few moments and retry\n2. Check SAP system health (transaction SM50, AL11)\n3. Contact SAP operations team\n4. Review debug.log for detailed error traces`;
        } else {
          userMessage = `**Connection Error**\n\n${err.message}\n\n**Common causes:**\n- SAP_HOST URL is incorrect or unreachable\n- Network connectivity issues\n- Firewall blocking connection\n- SSL certificate validation failed\n\n**Verification:**\n1. Test connectivity: ping ${(process.env.SAP_HOST || 'your-sap-host').split('://')[1]?.split(':')[0]}\n2. Verify SAP_HOST in .env is correct\n3. Check firewall rules allow HTTPS to port 44300`;
        }

        return {
          content: [{ 
            type: 'text', 
            text: `# ❌ Transport Analysis Failed\n\n${userMessage}` 
          }],
          isError: true
        };
      }

      try {
        debugLog(`Fetching objects for transport: ${sanitizedTransportId}`);
        objects = await getObjectsFromTransport(sanitizedTransportId);
        debugLog(`Retrieved ${objects.length} objects from transport`);
      } catch (err: any) {
        warnLog(`Failed to get objects for transport ${sanitizedTransportId}`, err);
      }

      if (objects.length === 0) {
        let diagnosticMsg = `# TRANSPORT ANALYSIS - ${sanitizedTransportId}\n\n`;
        diagnosticMsg += `## Transport Information\n`;
        diagnosticMsg += `- **Transport ID:** ${metadata.transportId}\n`;
        diagnosticMsg += `- **Description:** ${metadata.description}\n`;
        diagnosticMsg += `- **Owner:** ${metadata.owner}\n`;
        diagnosticMsg += `- **Status:** ${metadata.status}\n`;
        diagnosticMsg += `- **Created Date:** ${metadata.createdDate || 'Not available'}\n`;
        diagnosticMsg += `- **Target System:** ${metadata.targetSystem || 'Not specified'}\n`;
        diagnosticMsg += `- **Object Count:** ${metadata.objectCount}\n\n`;
        
        diagnosticMsg += `## Analysis Result\n`;
        diagnosticMsg += `⚠️ No ABAP source code objects found in transport ${sanitizedTransportId}.\n\n`;
        
        diagnosticMsg += `## Object Type Details\n`;
        diagnosticMsg += `- **Code-Carrying Objects Searched:** CLAS, PROG, FUGR, INTF, FUNC, TABL, VIEW, TYPE, ENPD, ENHS\n`;
        diagnosticMsg += `- **Code-Carrying Objects Found:** 0\n`;
        diagnosticMsg += `- **Total Transport Objects:** ${metadata.objectCount}\n\n`;
        
        diagnosticMsg += `## Possible Reasons\n`;
        diagnosticMsg += `1. **Configuration/Customizing Transport** - Contains IMG settings or data entries without ABAP code\n`;
        diagnosticMsg += `2. **Empty Transport** - Transport created but not populated with objects yet\n`;
        diagnosticMsg += `3. **Transport Not Released** - Transport is still in development status\n`;
        diagnosticMsg += `4. **Access Restrictions** - Current user lacks permissions to view objects in this transport\n`;
        diagnosticMsg += `5. **Non-ABAP Objects Only** - May contain table structures, business config, or other non-code objects\n\n`;
        
        diagnosticMsg += `## Recommended Actions\n`;
        diagnosticMsg += `- Verify the transport ID is correct\n`;
        diagnosticMsg += `- Check if transport is released for import (Status: ${metadata.status})\n`;
        diagnosticMsg += `- Verify user has S_TRANSPRT authorization in SAP\n`;
        diagnosticMsg += `- Contact transport owner: **${metadata.owner}**\n`;
        diagnosticMsg += `- Use SAP transaction SE10/SE09 to inspect transport contents manually\n`;
        diagnosticMsg += `- Review transport description: "${metadata.description}"\n\n`;
        
        // Add raw XML response for debugging
        diagnosticMsg += `## Raw ADT Response (XML)\n`;
        diagnosticMsg += `**Media Type Used:** ${(metadata as any).mediaType}\n`;
        diagnosticMsg += `**Response Length:** ${((metadata as any).rawXml || '').length} characters\n\n`;
        diagnosticMsg += `\`\`\`xml\n`;
        diagnosticMsg += `${((metadata as any).rawXml || 'No XML data available').substring(0, 2000)}\n`;
        if (((metadata as any).rawXml || '').length > 2000) {
          diagnosticMsg += `... (truncated, total ${((metadata as any).rawXml || '').length} characters)\n`;
        }
        diagnosticMsg += `\`\`\`\n`;
        
        return {
          content: [{ 
            type: 'text', 
            text: diagnosticMsg
          }]
        };
      }

      let analysisReport = `# TRANSPORT CODE ANALYSIS REPORT\n`;
      analysisReport += `**Transport ID:** ${sanitizedTransportId}\n`;
      analysisReport += `**Description:** ${metadata.description}\n`;
      analysisReport += `**Owner:** ${metadata.owner}\n`;
      analysisReport += `**Status:** ${metadata.status}\n`;
      analysisReport += `**Object Count:** ${objects.length}\n`;
      analysisReport += `**Generated:** ${new Date().toISOString()}\n\n`;

      const allAnalyses: CodeDiffAnalysis[] = [];
      let totalHighRisks = 0;
      let totalMediumRisks = 0;

      for (const obj of objects) {
        debugLog(`Analyzing object: ${obj.type}:${obj.name}`);
        const currentCode = await getObjectSource(obj);
        const previousCode = await getPreviousObjectSource(obj);

        if (!currentCode) continue;

        const patch = createPatch(
          `${obj.name}.${obj.type === 'CLAS' ? 'abap_class' : 'abap'}`,
          previousCode,
          currentCode,
          'Previous Version',
          'Active Version'
        );

        const hasChanges = patch.length > 0 && !patch.includes('No differences found');
        const { risks, summary } = analyzeCodeDiffForRisks(patch, currentCode, previousCode, obj.type);

        totalHighRisks += risks.filter(r => r.severity === 'HIGH').length;
        totalMediumRisks += risks.filter(r => r.severity === 'MEDIUM').length;

        allAnalyses.push({
          objectType: obj.type,
          objectName: obj.name,
          hasChanges,
          diff: hasChanges ? patch : 'No changes detected',
          riskFactors: risks,
          summaryOfChanges: summary
        });
      }

      // Generate Executive Summary
      analysisReport += `## EXECUTIVE SUMMARY\n`;
      analysisReport += `- **Total Objects Analyzed:** ${allAnalyses.length}\n`;
      analysisReport += `- **Objects with Changes:** ${allAnalyses.filter(a => a.hasChanges).length}\n`;
      analysisReport += `- **High-Risk Issues Detected:** ${totalHighRisks}\n`;
      analysisReport += `- **Medium-Risk Issues Detected:** ${totalMediumRisks}\n\n`;

      // Detailed Analysis per Object
      analysisReport += `## DETAILED ANALYSIS BY OBJECT\n\n`;
      
      for (const analysis of allAnalyses) {
        if (!analysis.hasChanges && analysis.riskFactors.length === 0) continue;

        analysisReport += `### ${analysis.objectType}: ${analysis.objectName}\n`;
        analysisReport += `**Status:** ${analysis.hasChanges ? 'Modified' : 'No Changes'}\n`;
        analysisReport += `**Risk Assessment:** ${analysis.summaryOfChanges}\n\n`;

        if (analysis.riskFactors.length > 0) {
          analysisReport += `**Risk Factors:**\n`;
          for (const risk of analysis.riskFactors) {
            analysisReport += `- **[${risk.severity}]** ${risk.category}: ${risk.finding}\n`;
          }
          analysisReport += `\n`;
        }

        if (analysis.hasChanges) {
          analysisReport += `**Code Diff:**\n\`\`\`diff\n${analysis.diff.substring(0, 1000)}\n`;
          if (analysis.diff.length > 1000) {
            analysisReport += `... (truncated, full diff available on request)\n`;
          }
          analysisReport += `\`\`\`\n\n`;
        }
      }

      // Recommendations
      analysisReport += `## RECOMMENDATIONS\n`;
      if (totalHighRisks > 0) {
        analysisReport += `⚠️ **CRITICAL**: ${totalHighRisks} high-risk issue(s) detected. Review and mitigate before production deployment.\n\n`;
      }
      if (totalMediumRisks > 0) {
        analysisReport += `⚡ **IMPORTANT**: ${totalMediumRisks} medium-risk issue(s) detected. Assess impact within your business context.\n\n`;
      }
      analysisReport += `- Review all authority checks for database modification operations\n`;
      analysisReport += `- Verify external dependencies exist in the target system\n`;
      analysisReport += `- Test for backward compatibility with existing implementations\n`;
      analysisReport += `- Validate hardcoded values are environment-appropriate\n`;

      debugLog(`Analysis completed for transport ${sanitizedTransportId}. High-risk: ${totalHighRisks}, Medium-risk: ${totalMediumRisks}`);

      return {
        content: [{ type: 'text', text: analysisReport }]
      };
    }

    return {
      content: [{ type: 'text', text: `Tool not found: ${name}` }],
      isError: true
    };

  } catch (error: any) {
    errorLog(`Unexpected error during tool execution`, { tool: name, transportId: sanitizedTransportId, error: error.message });
    
    const errorMessage = error.response?.status === 401 
      ? `Authorization Failed: Invalid SAP credentials or insufficient permissions. Verify S_DEVELOP, S_TRANSPRT authorities.`
      : error.response?.status === 404
      ? `Transport Not Found: Transport ID "${sanitizedTransportId}" does not exist or is not accessible.`
      : `Execution failed: ${error.message}`;

    return {
      content: [{ type: 'text', text: errorMessage }],
      isError: true
    };
  }
});

// Start connection logic inside safe async function to avoid top-level await errors in CommonJS
async function runServer() {
  try {
    debugLog('Initializing MCP Server...');
    const transport = new StdioServerTransport();
    
    debugLog('Connecting to MCP transport...');
    await mcpServer.connect(transport);
    
    debugLog('✅ MCP Server successfully connected and ready to handle requests');
    debugLog(`Available tools: get_transport_metadata, analyze_transport_changes`);
  } catch (error: any) {
    errorLog('Fatal error during MCP server startup', { error: error.message, stack: error.stack });
    console.error('\n❌ FATAL ERROR - MCP Server Initialization Failed\n');
    console.error(`Error: ${error.message}\n`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('Possible causes:');
      console.error('- MCP protocol communication error');
      console.error('- Parent process not properly configured');
      console.error('- Transport protocol mismatch');
    } else if (error.message.includes('ENOENT')) {
      console.error('File not found error - check project structure');
    }
    
    console.error('\n💡 Troubleshooting:');
    console.error('1. Check debug.log for detailed error traces');
    console.error('2. Verify Node.js version is 18+');
    console.error('3. Ensure dependencies installed: npm install');
    console.error('4. Review README.md for setup instructions\n');
    
    process.exit(1);
  }
}

// Start the server with graceful shutdown handling
runServer().catch((error) => {
  errorLog('Unhandled error running MCP server', { error: error.message });
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  debugLog('SIGTERM signal received: closing MCP server gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  debugLog('SIGINT signal received: closing MCP server gracefully');
  process.exit(0);
});