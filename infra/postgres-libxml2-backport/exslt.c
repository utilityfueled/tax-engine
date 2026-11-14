#include <string.h>
#include <libxml/parser.h>
#include <libexslt/exslt.h>
#include <libxslt/transform.h>
#include <libxslt/xsltutils.h>

int main(void) {
    const char sheet[] =
        "<xsl:stylesheet version='1.0' xmlns:xsl='http://www.w3.org/1999/XSL/Transform' "
        "xmlns:exsl='http://exslt.org/common'>"
        "<xsl:output method='text'/><xsl:template match='/'>"
        "<xsl:value-of select=\"function-available('exsl:node-set')\"/>"
        "</xsl:template></xsl:stylesheet>";
    const char source[] = "<root/>";
    xmlInitParser();
    exsltRegisterAll();
    xmlDocPtr style_doc = xmlReadMemory(sheet, sizeof(sheet)-1, NULL, "UTF-8", XML_PARSE_NONET);
    if (style_doc == NULL)
        return 1;
    xsltStylesheetPtr style = xsltParseStylesheetDoc(style_doc);
    if (style == NULL)
        return 2;
    xmlDocPtr source_doc = xmlReadMemory(source, sizeof(source)-1, NULL, "UTF-8", XML_PARSE_NONET);
    if (source_doc == NULL)
        return 3;
    xmlDocPtr output = xsltApplyStylesheet(style, source_doc, NULL);
    xmlChar *buffer = NULL;
    int count = 0;
    int status = output != NULL &&
                 xsltSaveResultToString(&buffer, &count, output, style) >= 0 &&
                 count == 4 && memcmp(buffer, "true", 4) == 0 ? 0 : 5;
    if (buffer != NULL)
        xmlFree(buffer);
    if (output != NULL)
        xmlFreeDoc(output);
    xmlFreeDoc(source_doc);
    xsltFreeStylesheet(style);
    xsltCleanupGlobals();
    xmlCleanupParser();
    return status;
}
