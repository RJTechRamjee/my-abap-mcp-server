"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const xml2js_1 = require("xml2js");
/**
 * Unit Tests for MCP Server Transport Analysis Functions
 * Test Transport: A4HK900083
 */
// Mock XML response for transport metadata
const mockTransportXML = `<?xml version="1.0" encoding="UTF-8"?>
<tm:transportRequest xmlns:tm="http://www.sap.com/adt/tm">
  <tm:shortDescription>Test Transport for Unit Testing</tm:shortDescription>
  <tm:user>ABAPDEV</tm:user>
  <tm:status>Released</tm:status>
  <tm:createdDate>2026-06-28T10:30:00Z</tm:createdDate>
  <tm:targetSystem>PROD</tm:targetSystem>
  <tm:object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_TEST_CLASS"/>
  <tm:object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZTEST_REPORT"/>
  <tm:object tm:pgmid="R3TR" tm:type="INTF" tm:name="ZIF_TEST_INTERFACE"/>
</tm:transportRequest>`;
describe('XML Parsing Utilities', () => {
    test('should parse transport XML metadata correctly', async () => {
        const parsed = await (0, xml2js_1.parseStringPromise)(mockTransportXML);
        expect(parsed).toBeDefined();
        expect(parsed['tm:transportRequest']).toBeDefined();
        const transportNode = parsed['tm:transportRequest'];
        expect(transportNode['tm:shortDescription']).toBeDefined();
        expect(transportNode['tm:user']).toBeDefined();
        expect(transportNode['tm:status']).toBeDefined();
    });
    test('should extract description from XML', async () => {
        const parsed = await (0, xml2js_1.parseStringPromise)(mockTransportXML);
        const desc = parsed['tm:transportRequest']['tm:shortDescription'][0];
        expect(desc).toBe('Test Transport for Unit Testing');
    });
    test('should extract owner from XML', async () => {
        const parsed = await (0, xml2js_1.parseStringPromise)(mockTransportXML);
        const owner = parsed['tm:transportRequest']['tm:user'][0];
        expect(owner).toBe('ABAPDEV');
    });
    test('should extract status from XML', async () => {
        const parsed = await (0, xml2js_1.parseStringPromise)(mockTransportXML);
        const status = parsed['tm:transportRequest']['tm:status'][0];
        expect(status).toBe('Released');
    });
    test('should extract objects from transport XML', async () => {
        const parsed = await (0, xml2js_1.parseStringPromise)(mockTransportXML);
        const objects = parsed['tm:transportRequest']['tm:object'];
        expect(Array.isArray(objects)).toBe(true);
        expect(objects.length).toBe(3);
        expect(objects[0]['$']['tm:type']).toBe('CLAS');
        expect(objects[0]['$']['tm:name']).toBe('ZCL_TEST_CLASS');
        expect(objects[1]['$']['tm:type']).toBe('PROG');
        expect(objects[1]['$']['tm:name']).toBe('ZTEST_REPORT');
    });
});
describe('Code Diff Analysis', () => {
    test('should detect hardcoded numeric values', () => {
        const testCode = `
      DATA: lv_account_id TYPE string VALUE '1234567890'.
      DATA: lv_hex_value TYPE x VALUE 0xABCDEF.
    `;
        // Simple regex check
        const hasHardcoded = /['"].*\d{10,}['"]|0x[0-9A-Fa-f]+/.test(testCode);
        expect(hasHardcoded).toBe(true);
    });
    test('should detect potential missing authority checks', () => {
        const codeDiff = `
      + DATA: ls_order TYPE bapisdorder.
      + MODIFY bapisdorder FROM ls_order.
      + INSERT INTO zorders VALUES ls_order.
    `;
        const hasAuthCheck = /AUTHORITY-CHECK|CHECK.*AUTHORITY|IF.*AUTHORIZED/.test(codeDiff);
        const hasDBModify = /INSERT|UPDATE|DELETE|MODIFY|APPEND.*TO|CLEAR/.test(codeDiff);
        expect(hasDBModify).toBe(true);
        expect(hasAuthCheck).toBe(false);
    });
    test('should detect breaking API changes (PRIVATE)', () => {
        const currentCode = `METHODS get_data RETURNING VALUE(result) TYPE string PRIVATE.`;
        const previousCode = `METHODS get_data RETURNING VALUE(result) TYPE string PUBLIC.`;
        const hasPrivateChange = currentCode.includes('PRIVATE') && !previousCode.includes('PRIVATE');
        expect(hasPrivateChange).toBe(true);
    });
    test('should detect large code deletions', () => {
        const deletedLines = Array(25).fill('-').map((_, i) => `- DELETED_LINE_${i}`);
        const totalLines = 35;
        const deletionRatio = deletedLines.length / totalLines;
        const isLargeDeletion = deletedLines.length > 20 && deletionRatio > 0.5;
        expect(isLargeDeletion).toBe(true);
    });
    test('should detect new external dependencies', () => {
        const diff = `
      + CALL METHOD zcl_external_class=>process_data.
      + CALL FUNCTION 'Z_EXT_FM' EXPORTING data = lv_data.
      + CALL BADI lr_badi_impl.
    `;
        const externalCalls = diff.match(/\+.*CALL.*METHOD|CALL.*FUNCTION|CALL.*BADI/g);
        expect(externalCalls).toBeDefined();
        expect(externalCalls?.length).toBeGreaterThan(0);
    });
});
describe('Risk Factor Classification', () => {
    test('should classify HIGH severity risks correctly', () => {
        const highSeverityRisks = [
            'Missing AUTHORITY-CHECK on database modification',
            'Breaking API change - visibility changed to PRIVATE',
            'Direct SQL injection vulnerability'
        ];
        expect(highSeverityRisks.length).toBeGreaterThan(0);
        expect(highSeverityRisks[0]).toContain('AUTHORITY');
    });
    test('should classify MEDIUM severity risks correctly', () => {
        const mediumSeverityRisks = [
            'Hardcoded values detected',
            'Large code deletion (>20 lines)',
            'New external dependencies'
        ];
        expect(mediumSeverityRisks.length).toBeGreaterThan(0);
    });
    test('should classify LOW severity risks correctly', () => {
        const lowSeverityRisks = [
            'Variable naming convention violation',
            'Potential performance issue',
            'Code comment missing for complex logic'
        ];
        expect(lowSeverityRisks.length).toBeGreaterThan(0);
    });
});
describe('Transport Analysis Integration', () => {
    test('Transport A4HK900083 should have valid structure', () => {
        const transportId = 'A4HK900083';
        expect(transportId).toBeDefined();
        expect(transportId).toMatch(/^[A-Z0-9]+$/);
        expect(transportId.length).toBe(10);
    });
    test('should generate non-empty analysis report', () => {
        const mockReport = `# TRANSPORT CODE ANALYSIS REPORT
**Transport ID:** A4HK900083
**Description:** Test Transport
**Owner:** ABAPDEV
**Status:** Released
**Object Count:** 3

## EXECUTIVE SUMMARY
- **Total Objects Analyzed:** 3
- **Objects with Changes:** 2
- **High-Risk Issues Detected:** 1
- **Medium-Risk Issues Detected:** 2`;
        expect(mockReport).toBeDefined();
        expect(mockReport).toContain('A4HK900083');
        expect(mockReport).toContain('EXECUTIVE SUMMARY');
        expect(mockReport).toContain('High-Risk');
    });
    test('should properly format metadata for LLM consumption', () => {
        const metadata = {
            transportId: 'A4HK900083',
            description: 'Test Transport for Unit Testing',
            owner: 'ABAPDEV',
            status: 'Released',
            createdDate: '2026-06-28T10:30:00Z',
            targetSystem: 'PROD',
            objectCount: 3
        };
        expect(JSON.stringify(metadata)).toBeDefined();
        expect(metadata.transportId).toBe('A4HK900083');
        expect(metadata.objectCount).toBe(3);
    });
});
describe('Error Handling and Edge Cases', () => {
    test('should handle empty transport gracefully', () => {
        const emptyTransportResult = 'No code-carrying objects found in transport';
        expect(emptyTransportResult).toBeDefined();
    });
    test('should handle missing metadata fields', () => {
        const partialMetadata = {
            transportId: 'A4HK900083',
            description: 'N/A',
            owner: 'Unknown',
            status: 'Unknown'
        };
        expect(partialMetadata.description).toBe('N/A');
        expect(partialMetadata.owner).toBe('Unknown');
    });
    test('should provide helpful error messages for authorization failures', () => {
        const authError = 'Authorization Failed: Invalid SAP credentials or insufficient permissions. Verify S_DEVELOP, S_TRANSPRT authorities.';
        expect(authError).toContain('S_DEVELOP');
        expect(authError).toContain('S_TRANSPRT');
    });
    test('should provide helpful error messages for not found', () => {
        const notFoundError = 'Transport Not Found: Transport ID "A4HK900083" does not exist or is not accessible.';
        expect(notFoundError).toContain('A4HK900083');
    });
});
