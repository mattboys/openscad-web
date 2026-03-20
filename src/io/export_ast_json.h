#pragma once

#include <string>

class SourceFile;

/**
 * Serialize the parsed SourceFile AST to a JSON string (Phase 2 web IR).
 * Schema version is embedded in the JSON as "version".
 */
std::string export_source_file_ast_json(const SourceFile& root);
