'use strict';
const chai = require('chai');
const expect = chai.expect;
const Promisie = require('promisie');
const MOCKS = require('../mocks');
const path = require('path');
const CREATE_EVALUATOR = require(path.join(__dirname, '../../lib')).create;

chai.use(require('chai-spies'));

describe('requirements module', function () {
  describe('basic assumptions', function () {
    it('should have a create method that is a function', () => {
      expect(CREATE_EVALUATOR).to.be.a('function');
    });
    it('should accept a segment as an arguments and generate an evaluator', () => {
      let evaluator = CREATE_EVALUATOR(MOCKS.DEFAULT, 'init_requirements');
      expect(evaluator).to.be.a('function');
    });
  });
  describe('evaluation of simple rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.BASIC, 'init_requirements');
      done();
    });
    it('should pass when all evaluations result in true', async function () {
      let result = await evaluation({
        age: 19,
        applicant_state: 'NJ',
        debt_to_income: 0.05,
        income: 80000,
      });
      expect(result.passed).to.be.true;
      expect(result.decline_reasons.length).to.equal(0);
    });
    it('should fail when an evaluation results in false', async function () {
      let result = await evaluation({
        age: 16,
        applicant_state: 'MI',
        debt_to_income: 0.4,
        income: 35000,
      });
      expect(result.passed).to.be.false;
      expect(result.decline_reasons.length).to.equal(4);
    });
    it('should properly handle an error', async function () {
      let result = await evaluation({
        age: 17,
      });
      expect(result.error).to.have.string('The Variable debt_to_income is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
  });

  describe('evaluation of complex rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.COMPLEX, 'init_requirements');
      done();
    });
    it('should pass when all evaluations result in true', async function () {
      let result = await evaluation({
        age: 25,
        is_employed: true,
        annual_income: 80000,
        fico_score: 800,
        checking_account_balance: 100000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.passed).to.be.true;
      expect(result.decline_reasons.length).to.equal(0);
    });
    it('should still pass even when one of OR evaluation results in false', async function () {
      let result = await evaluation({
        age: 25,
        is_employed: true,
        annual_income: 0,
        fico_score: 800,
        checking_account_balance: 500000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.passed).to.be.true;
      expect(result.decline_reasons.length).to.equal(0);
    });
    it('should fail when all OR evaluations result in false', async function () {
      let result = await evaluation({
        age: 50,
        is_employed: true,
        annual_income: 10000,
        fico_score: 650,
        checking_account_balance: 1000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.passed).to.be.false;
      expect(result.decline_reasons.length).to.equal(1);
    });
    it('should fail when one of the AND evaluation results in false', async function () {
      let result = await evaluation({
        age: 25,
        is_employed: false,
        annual_income: 80000,
        fico_score: 800,
        checking_account_balance: 100000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.passed).to.be.false;
      expect(result.decline_reasons.length).to.equal(1);
    });
  });

  describe('evaluation of dynamic value rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.DYNAMIC, 'init_requirements');
      done();
    });
    it('should do range comparison against the variables on the state', async function () {
      let result = await evaluation({
        dynamic_interest_rate_min: 0.07,
        dynamic_interest_rate_max: 0.2,
        calculated_interest_rate: 0.25,
      });
      expect(result.passed).to.be.false;
      expect(result.decline_reasons.length).to.equal(1);
      let second_result = await evaluation({
        dynamic_interest_rate_min: 0.07,
        dynamic_interest_rate_max: 0.2,
        calculated_interest_rate: 0.19,
      });
      expect(second_result.passed).to.be.true;
      expect(second_result.decline_reasons.length).to.equal(0);
    });
    it('should error when missing a variable for range comparison', async function () {
      let result = await evaluation({
        dynamic_interest_rate_max: 0.2,
        calculated_interest_rate: 0.19,
      });
      expect(result.error).to.have.string('The Variable dynamic_interest_rate_min is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
    it('should do comparison against the variables on the state', async function () {
      evaluation = CREATE_EVALUATOR({
        "name": "segment_1",
        "ruleset": [
          {
            "rule_name": "rule_0",
            "condition_test": "GT",
            "value_comparison": "min_age",
            "value_comparison_type": "variable",
            "variable_name": "age",
            "condition_output": {
              "decline_reason": "Failed Minimum Age Requirement"
            }
          }
        ]
      }, 'init_requirements');
      let result = await evaluation({
        min_age: 18,
        age: 12,
      });
      expect(result.passed).to.be.false;
      expect(result.decline_reasons.length).to.equal(1);
      let second_result = await evaluation({
        min_age: 18,
        age: 20,
      });
      expect(second_result.passed).to.be.true;
      expect(second_result.decline_reasons.length).to.equal(0);
    });
    it('should error when missing a variable for value comparison', async function () {
      let result = await evaluation({
        age: 20,
      });
      expect(result.error).to.have.string('The Variable min_age is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
  });
});