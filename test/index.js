'use strict';
const createEvaluator = require('../lib/create');
const util = require('util');
let evaluator = createEvaluator({
  name: 'segment_1',
  ruleset: [
    {
      rule_name: 'rule_0',
      condition_test: 'GT',
      value_comparison: new Date('1960-01-01').toISOString(),
      value_comparison_type: 'value',
      // value_minimum: new Date('2018-04-01').toISOString(),
      // value_minimum_type: 'value',
      // value_maximum: new Date('2018-04-30').toISOString(),
      // value_maximum_type: 'value',
      variable_name: 'today',
      condition_output: {
        decline_reason: 'Failed Today Date'
      },

    },
    {
      rule_name: 'rule_1',
      rule_type: 'OR',
      condition_test: 'RANGE',
      value_minimum: 1,
      value_minimum_type: 'value',
      value_maximum: 10,
      value_maximum_type: 'value',
      variable_name: 'age',
      condition_output: {
        decline_reason: 'isValidAge',
      },
    }, {
      rule_name: 'rule_1',
      rule_type: 'OR',
      condition_test: 'GT',
      value_comparison: 'compareage',
      value_comparison_type: 'variable',
      variable_name: 'age',
      condition_output: {
        decline_reason: 'isValidAge',
      },
    },
    {
      rule_name: 'rule_2',
      condition_test: 'FLOOR',
      value_comparison: 'compareage',
      value_comparison_type: 'variable',
      variable_name: 'age',
      condition_output: {
        decline_reason: 'Failed compareage'
      },
    },
    {
      rule_name: 'rule_3',
      rule_type: 'AND',
      condition_test: 'RANGE',
      value_minimum: 'dob',
      value_minimum_type: 'variable',
      value_maximum: 'dobend',
      value_maximum_type: 'variable',
      variable_name: 'dobstart',
      condition_output: {
        decline_reason: 'Failed NJ Res and DOB'
      },
    }, {
      rule_name: 'rule_3',
      rule_type: 'AND',
      condition_test: 'EQUAL',
      value_comparison: 'NJ',
      value_comparison_type: 'value',
      variable_name: 'state',
      condition_output: {
        decline_reason: 'Failed NJ Res and DOB'
      },
    }, ]
}, 'test_requirements_module');
let runEval = evaluator({
  today: new Date().toISOString(),
  age: 18,
  compareage: 21,
  dobstart: new Date('1960-01-01').toISOString(),
  dobend: new Date('1993-09-03').toISOString(),
  dob: new Date('1992-09-02').toISOString(),
  state: 'NJ',
});

runEval.then(result => {
  // console.log(util.inspect(result, { depth: 20 }))
})
  .catch(e => {
    // console.log({ e })
  })