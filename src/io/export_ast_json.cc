#include "io/export_ast_json.h"

#include <sstream>
#include <string>

#include "core/Assignment.h"
#include "core/AST.h"
#include "core/Expression.h"
#include "core/function.h"
#include "core/LocalScope.h"
#include "core/ModuleInstantiation.h"
#include "core/SourceFile.h"
#include "core/UserModule.h"
#include "json/json.hpp"

namespace {

nlohmann::json locationToJson(const Location& loc)
{
  if (loc.isNone()) {
    return nullptr;
  }
  return {
      {"file", loc.fileName()},
      {"firstLine", loc.firstLine()},
      {"firstColumn", loc.firstColumn()},
      {"lastLine", loc.lastLine()},
      {"lastColumn", loc.lastColumn()},
  };
}

nlohmann::json expressionToJson(const Expression& e)
{
  std::ostringstream oss;
  e.print(oss, "");
  nlohmann::json j;
  j["loc"] = locationToJson(e.location());
  j["text"] = oss.str();
  return j;
}

nlohmann::json parametersToJson(const AssignmentList& parameters)
{
  nlohmann::json arr = nlohmann::json::array();
  for (const auto& param : parameters) {
    nlohmann::json pj;
    pj["loc"] = locationToJson(param->location());
    pj["name"] = param->getName();
    if (param->getExpr()) {
      pj["expr"] = expressionToJson(*param->getExpr());
    } else {
      pj["expr"] = nullptr;
    }
    arr.push_back(pj);
  }
  return arr;
}

nlohmann::json assignmentStatementToJson(const Assignment& a)
{
  nlohmann::json j;
  j["type"] = "assignment";
  j["loc"] = locationToJson(a.location());
  j["name"] = a.getName();
  if (a.getExpr()) {
    j["expr"] = expressionToJson(*a.getExpr());
  } else {
    j["expr"] = nullptr;
  }
  return j;
}

nlohmann::json localScopeToJson(const LocalScope& scope);

nlohmann::json moduleInstantiationToJson(const ModuleInstantiation& m)
{
  nlohmann::json j;
  j["loc"] = locationToJson(m.location());
  j["name"] = m.name();
  j["tags"] = {{"root", m.isRoot()}, {"highlight", m.isHighlight()}, {"background", m.isBackground()}};

  nlohmann::json args = nlohmann::json::array();
  for (const auto& arg : m.arguments) {
    nlohmann::json aj;
    aj["loc"] = locationToJson(arg->location());
    aj["name"] = arg->getName();
    if (arg->getExpr()) {
      aj["expr"] = expressionToJson(*arg->getExpr());
    } else {
      aj["expr"] = nullptr;
    }
    args.push_back(aj);
  }
  j["arguments"] = args;

  if (m.scope->numElements() == 0) {
    j["children"] = nullptr;
  } else {
    j["children"] = localScopeToJson(*m.scope);
  }

  if (const auto *ifelse = dynamic_cast<const IfElseModuleInstantiation *>(&m)) {
    j["type"] = "if";
    if (ifelse->getElseScope()) {
      j["elseChildren"] = localScopeToJson(*ifelse->getElseScope());
    } else {
      j["elseChildren"] = nullptr;
    }
  } else {
    j["type"] = "instantiation";
  }
  return j;
}

nlohmann::json userModuleToJson(const UserModule& m)
{
  nlohmann::json j;
  j["type"] = "module";
  j["loc"] = locationToJson(m.location());
  j["name"] = m.name;
  j["parameters"] = parametersToJson(m.parameters);
  j["body"] = localScopeToJson(*m.body);
  return j;
}

nlohmann::json userFunctionToJson(const UserFunction& f)
{
  nlohmann::json j;
  j["type"] = "function";
  j["loc"] = locationToJson(f.location());
  j["name"] = f.name;
  j["parameters"] = parametersToJson(f.parameters);
  if (f.expr) {
    j["expr"] = expressionToJson(*f.expr);
  } else {
    j["expr"] = nullptr;
  }
  return j;
}

nlohmann::json localScopeToJson(const LocalScope& scope)
{
  nlohmann::json arr = nlohmann::json::array();
  for (const auto& f : scope.astSerializationFunctions()) {
    arr.push_back(userFunctionToJson(*f.second));
  }
  for (const auto& m : scope.astSerializationModules()) {
    arr.push_back(userModuleToJson(*m.second));
  }
  for (const auto& assignment : scope.assignments) {
    arr.push_back(assignmentStatementToJson(*assignment));
  }
  for (const auto& inst : scope.moduleInstantiations) {
    arr.push_back(moduleInstantiationToJson(*inst));
  }
  return arr;
}

}  // namespace

std::string export_source_file_ast_json(const SourceFile& root)
{
  nlohmann::json j;
  j["version"] = 1;
  j["type"] = "openscad-ast";
  j["filename"] = root.getFilename();
  j["modulePath"] = root.modulePath();

  nlohmann::json uses = nlohmann::json::array();
  for (const auto& p : root.usedlibs) {
    uses.push_back(p);
  }
  j["uses"] = uses;

  nlohmann::json includes = nlohmann::json::array();
  for (const auto& kv : root.includes) {
    includes.push_back({{"local", kv.first}, {"full", kv.second}});
  }
  j["includes"] = includes;

  j["body"] = localScopeToJson(*root.scope);
  return j.dump(2);
}
