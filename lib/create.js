'use strict';
const vm = require('vm');
const Conditional = require('@digifi-los/comparison').Conditional;
const Promisie = require('promisie');

/**
 * Sets state inside of a "_global" property and contextifies with a compare function in its scope
 * @param {Object} state Application state data containing data from previous functions
 * @param {function} compare A bound copy of the Conditional.compare method
 * @return {Object} VM contextified state object
 */
var createContext = function (state, compare) {
  let _global = { state, };
  let context = { _global, compare };
  vm.createContext(context);
  return context;
};

/**
 * Handles coverting values to string representations consumable by the VM script
 * @param  {*} value Value to convert for the VM
 * @return {string|number}       Converted value
 */
var handleValueAssignment = function (value) {
  if (typeof value === 'string' && value.includes('_global.state')) return value;
  if (typeof value === 'string') return `'${value}'`;
  else if (Array.isArray(value)) {
    return (
      value.reduce((result, v, index) => {
        result +=
          (typeof v === 'string' ? `'${v}'` : v) +
          (index !== value.length - 1 ? ', ' : '');
        return result;
      }, '[') + ']'
    );
  } else if (value && typeof value === 'object') return JSON.stringify(value);
  else return value;
};

/**
 * Handles tracking unique or group ids and their associated decline reasons
 * @param  {Object[]} groups   An array of touples arranged as groupid, object containing decline reasons
 * @param  {string} groupid  A string representing a group id for the or group
 * @param  {string|string[]}  decline_reasons  Decline reasons or codes associated to the or group
 * @return {Object[]}          Updated or group array
 */
var handleOrGroupInsertion = function (groups, groupid, decline_reason = []) {
  let groupKeys = Object.keys(groups);
  let groupIndex = groupKeys.indexOf(groupid);
  if (groupIndex === -1) {
    groups[ groupid ] = {
      condition_output: {
        decline_reason: typeof decline_reason === 'string'
          ? [ decline_reason, ]
          : decline_reason || [],
      }
    };
  } else if (decline_reason) {
    let group = groups[ groupid ];
    group.condition_output.decline_reason = group.condition_output.decline_reason
      .concat(decline_reason)
      .reduce((result, code) => {
        return result.indexOf(code) === -1 ? result.concat(code) : result;
      }, []);
  }
  return groups;
};

/**
 * Handles tracking unique or group ids and their associated decline reasons
 * @param  {Object[]} groups   An array of touples arranged as groupid, object containing decline reasons
 * @param  {string} groupid  A string representing a group id for the or group
 * @param  {string|string[]}  decline_reasons  Decline reasons or codes associated to the or group
 * @return {Object[]}          Updated or group array
 */
var handleAndGroupInsertion = function (groups, groupid, decline_reason = []) {
  let groupIndex = groups.indexOf(groupid);
  if (groupIndex === -1) {
    groups.push([
      groupid,
      {
        condition_output: {
          decline_reason: typeof decline_reason === 'string'
            ? [ decline_reason, ]
            : decline_reason || [],
        }
      },
    ]);
  } else if (decline_reason) {
    let group = groups[ groupIndex ];
    group.condition_output.decline_reason = group.condition_output.decline_reason
      .concat(decline_reason)
      .reduce((result, code) => {
        return result.indexOf(code) === -1 ? result.concat(code) : result;
      }, []);
  }
  return groups;
};

/**
 * Creates a script that will be run inside of vm based on segment configuration
 * @param {Object} ruleset Configuration object for segement evaluator
 * @param {Object[]} ruleset.rules Array of evaluations that should be run against data
 * @param {string} ruleset.rules.condition_operations Describes if passing condition should be all-true ("AND") or one true ("OR")
 * @param {string} ruleset.rules.variable_name The field which should be evaluated within the state object
 * @param {string} ruleset.rules.value_comparison Value which data derived from state object should be compared against
 * @param {string} ruleset.rules.condition_test Description of the conditional test to be applied
 * @param {string} ruleset.rules.rule_name Defines a "OR" group id and is required for proper evaluation of "OR" group
 * @param {string} ruleset.rules.condition_output Defines the key on the reporting that the individual pass/fail evaluation should be recorded on
 * @return {string} Returns a string representation of a script to be run in VM
 */
var createScript = function (ruleset) {
  let rules = ruleset;
  let or_requirement_groups = {};
  let and_requirement_groups = [];
  let string_evaluator = rules.reduce((script, test) => {
    let {
      variable_name,
      condition_test,
      condition_operation,
      rule_name,
      rule_type,
      condition_output,
      condition_output_types,
      value_comparison,
      value_minimum,
      value_maximum,
      value_minimum_type,
      value_maximum_type,
      value_comparison_type,
    } = test;
    let condition1 = condition_test.toLowerCase().replace(/\s+/g, '');
    let condition2;
    let or_test = /or/i.test(rule_type);
    let and_test = /and/i.test(rule_type);
    let eval_group;

    if (condition_output_types && condition_output_types.decline_reason === 'variable' && condition_output && condition_output.decline_reason) {
      script += `if (_global.state['${condition_output.decline_reason}'] === undefined) throw new Error("The Variable ${condition_output.decline_reason} is required by a Rule but is not defined.");\r\n`
    }

    let decline_reason = condition_output.decline_reason = (condition_output_types && condition_output_types.decline_reason === 'variable' && condition_output.decline_reason) ? `_global.state['${condition_output.decline_reason}']` : condition_output.decline_reason;

    value_comparison = (value_comparison && value_comparison_type === 'variable') ? `_global.state['${value_comparison}']` : value_comparison;
    value_minimum = (value_minimum && value_minimum_type === 'variable') ? `_global.state['${value_minimum}']` : value_minimum;
    value_maximum = (value_maximum && value_maximum_type === 'variable') ? `_global.state['${value_maximum}']` : value_maximum;

    script += `if(_global.state[${handleValueAssignment(variable_name)}] === undefined) throw new Error('The Variable ${variable_name} is required by a Rule but is not defined.');\r\n`
    script += `if(/range/i.test("${condition_test}") && ${handleValueAssignment(value_minimum)} === undefined) throw new Error("The Variable ${test.value_minimum} is required by a Rule but is not defined.");\r\n`
    script += `if(/range/i.test("${condition_test}") && ${handleValueAssignment(value_maximum)} === undefined) throw new Error("The Variable ${test.value_maximum} is required by a Rule but is not defined.");\r\n`
    script += `if(!(/range/i.test("${condition_test}")) && !(/null/i.test("${condition_test}")) && ${handleValueAssignment(value_comparison)} === undefined) throw new Error("The Variable ${test.value_comparison} is required by a Rule but is not defined.");\r\n`

    script += `evaluation_result = compare(_global.state[${handleValueAssignment(variable_name)}]).${condition1}`;

    if (typeof condition2 === 'string') script += `.${condition2}`;
    script += `(${
      /range/i.test(condition_test)
        ? handleValueAssignment(value_minimum) + ', ' + handleValueAssignment(value_maximum)
        : handleValueAssignment(value_comparison)
      });\r\n`;

    if (or_test && rule_name) {
      script += `_global.${rule_name} = _global.${rule_name} || [];\r\n`;
      eval_group = `_global.${rule_name}`;
      or_requirement_groups = handleOrGroupInsertion(
        or_requirement_groups,
        rule_name,
        condition_output.decline_reason
      );
    } else if (and_test && rule_name) {
      script += `_global.${rule_name} = _global.${rule_name} || [];\r\n`;
      eval_group = `_global.${rule_name}`;
      and_requirement_groups = handleAndGroupInsertion(
        and_requirement_groups,
        rule_name,
        condition_output.decline_reason
      );
    } else eval_group = '_global.passes';

    if (or_test) {
      script += `_global.output_types['${rule_name}'] = {'rule_type': '${rule_type}', 'decline_reason': '${decline_reason}'};\r\n`;
    }
    if (and_test) {
      script += `_global.output_types['${rule_name}'] = {'rule_type': '${rule_type}', 'decline_reason': '${decline_reason}'};\r\n`;
    }
    script += `${eval_group}.push(evaluation_result);\r\n`;
    script += `_global.rule_results.push({name: ${handleValueAssignment(rule_name)}, passed: evaluation_result, decline_reasons: ${handleValueAssignment(condition_output.decline_reason)}})\r\n`;

    if (!or_test && !and_test) {
      if (
        typeof condition_output.decline_reason === 'string' ||
        Array.isArray(condition_output.decline_reason)
      ) {
        script += `_global.decline_reasons = (evaluation_result) ? _global.decline_reasons : _global.decline_reasons.concat(${
          (typeof condition_output.decline_reason === 'string' && condition_output.decline_reason.includes('_global.state'))
            ? handleValueAssignment(condition_output.decline_reason)
            : (typeof condition_output.decline_reason === 'string' && !condition_output.decline_reason.includes('_global.state'))
              ? '\'' + condition_output.decline_reason + '\''
              : handleValueAssignment(condition_output.decline_reason)
          });\r\n`;
      }
    }
    return script;
  }, '"use strict";\r\n_global.passes = [];\r\n_global.rule_results = [];\r\n_global.output_types = {};\r\n_global.decline_reasons = [];\r\nlet evaluation_result;\r\n');
  let or_requirement_keys = Object.keys(or_requirement_groups);
  or_requirement_groups = or_requirement_keys.length ? or_requirement_keys.map(key => {
    return [ key, or_requirement_groups[ key ] ]
  }) : [];

  let or_evaluations = or_requirement_groups.length
    ? or_requirement_groups.reduce((result, groupkey, index) => {
      if (index < or_requirement_groups.length - 1)
        result += `_global.${groupkey[ 0 ]}.indexOf(true) !== -1 && `;
      else result += `_global.${groupkey[ 0 ]}.indexOf(true) !== -1`;

      return result;
    }, '(') + ')'
    : false;
  let and_evaluations = and_requirement_groups.length
    ? and_requirement_groups.reduce((result, groupkey, index) => {

      if (index < and_requirement_groups.length - 1) {
        result += `_global.${
          groupkey[ 0 ]
          }.every((item) => {return item === true}) && `;
      } else {
        result += `_global.${
          groupkey[ 0 ]
          }.every((item) => {return item === true})`;
      }
      return result;
    }, '(') + ')'
    : false;

  string_evaluator +=
    or_evaluations && and_evaluations
      ? `_global.passes = (_global.passes.indexOf(false) === -1 && ${or_evaluations} && ${and_evaluations});\r\n`
      : or_evaluations && !and_evaluations
        ? `_global.passes = (_global.passes.indexOf(false) === -1 && ${or_evaluations});\r\n`
        : !or_evaluations && and_evaluations
          ? `_global.passes = (_global.passes.indexOf(false) === -1 && ${and_evaluations});\r\n`
          : '_global.passes = _global.passes.indexOf(false) === -1';
  return string_evaluator;
};

function handleDeclineReasons(state, output_types, decline_reason) {
  if (typeof decline_reason === 'string') {
    decline_reason = (output_types[ 'decline_reason' ] === 'variable') ? state[ decline_reason ] : decline_reason;
  } else if (Array.isArray(decline_reason)) {
    decline_reason = decline_reason.map(dr => {
      return (output_types[ 'decline_reason' ] === 'variable') ? state[ dr ] : dr;
    });
  }
}

function onlyUnique(value, index, self) { 
  return (value && self.indexOf(value) === index);
}

/**
 * Creates an evaluator function
 * @param {Object} segment Configuration details for script and context of a vm that will be evaluated
 * @param {boolean} numeric If true percision evalutions will be performed on all numerical comparisons (uses the numeric npm package)
 * @return {Function} Segment evaluator function
 */
var createEvaluator = function (segment, module_name) {
  let script = createScript(segment.ruleset);
  let conditional = new Conditional();
  let compare = conditional.compare.bind(conditional);
  /**
   * Evaluates current state against the defined segment rules
   * @param {state} state State data used in evaluation of segment
   * @return {Object} returns the an object with a "passed" flag as well as a reporting object with individual pass/fail flags for each defined condition
   */
  return function evaluator(state) {
    let _state;
    let context;
    let evaluate;
    let decline_reason;
    let output_types;
    let result;
    try {
      _state = Object.assign({}, state);
      context = createContext(_state, compare);
      evaluate = new vm.Script(script);
      evaluate.runInContext(context);
      decline_reason = context._global.decline_reasons;

      output_types = context._global.output_types;
      context._global.rule_results.forEach(rule_result => {
        if (rule_result.passed && output_types[ rule_result.name ] && output_types[ rule_result.name ].rule_type === 'OR') output_types[ rule_result.name ].passed = true;
        if (output_types[ rule_result.name ] && output_types[ rule_result.name ].rule_type === 'AND') {
          if (rule_result.passed && output_types[ rule_result.name ].passed !== false) {
            output_types[ rule_result.name ].passed = true;
          } else {
            output_types[ rule_result.name ].passed = false;
          }
        }
      })
      Object.keys(output_types).forEach(output => {
        if (!output_types[ output ].passed) decline_reason.push(output_types[ output ].decline_reason);
      })
      handleDeclineReasons(state, output_types, decline_reason);
      decline_reason = decline_reason.filter(onlyUnique);
      result = {
        type: 'Requirements',
        passed: context._global.passes,
        name: module_name || '',
        segment: segment.name,
        decline_reasons: decline_reason,
        rules: context._global.rule_results,
      };
      if (segment.sync === true) return result;
      return Promisie.resolve(result);
    } catch (e) {
      state.error = {
        code: '',
        message: e.message,
      };
      if (segment.sync === true) return { error: e.message, result, }
      return Promisie.resolve({ error: e.message, result, });
    }
  };
};

module.exports = createEvaluator;