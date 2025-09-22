'use strict';

const { validateRules } = require('../src/rule-validator');

describe('Rule Validator', () => {
  const createValidRule = (overrides = {}) => ({
    server: 'TestNet',
    listen_channel: '#test',
    trigger_text: 'ping',
    response_text: 'pong',
    ...overrides,
  });

  describe('Valid Data', () => {
    it('should return valid for a correct single rule', () => {
      const rules = [createValidRule()];
      expect(validateRules(rules)).toEqual({ isValid: true });
    });

    it('should return valid for multiple correct rules', () => {
      const rules = [createValidRule(), createValidRule({ server: 'OtherNet' })];
      expect(validateRules(rules)).toEqual({ isValid: true });
    });

    it('should return valid for an empty array of rules', () => {
      const rules = [];
      expect(validateRules(rules)).toEqual({ isValid: true });
    });

    it('should return valid and correctly cast numeric strings', () => {
      const rules = [createValidRule({ cooldown_seconds: '10', delay_seconds: '5.5' })];
      const result = validateRules(rules);
      expect(result).toEqual({ isValid: true });
      expect(rules[0].cooldown_seconds).toBe(10);
      expect(rules[0].delay_seconds).toBe(5.5);
    });

    it('should handle optional fields being numbers already', () => {
        const rules = [createValidRule({ cooldown_seconds: 15, delay_seconds: 0 })];
        const result = validateRules(rules);
        expect(result).toEqual({ isValid: true });
        expect(rules[0].cooldown_seconds).toBe(15);
    });
  });

  describe('Invalid Data Structure', () => {
    it('should return invalid if input is not an array', () => {
      expect(validateRules({})).toEqual({ isValid: false, error: 'The provided rules data is not an array.' });
      expect(validateRules(null)).toEqual({ isValid: false, error: 'The provided rules data is not an array.' });
      expect(validateRules('string')).toEqual({ isValid: false, error: 'The provided rules data is not an array.' });
    });

    it('should return invalid if an item in the array is not an object', () => {
      expect(validateRules([null])).toEqual({ isValid: false, error: 'Rule #1 is not a valid object.' });
      expect(validateRules([createValidRule(), 'string'])).toEqual({ isValid: false, error: 'Rule #2 is not a valid object.' });
    });
  });

  describe('Invalid Rule Properties', () => {
    const requiredProps = ['server', 'listen_channel', 'trigger_text', 'response_text'];
    
    requiredProps.forEach(prop => {
      it(`should return invalid if required property '${prop}' is missing`, () => {
        const rule = createValidRule();
        delete rule[prop];
        expect(validateRules([rule])).toEqual({ isValid: false, error: `Rule #1 is missing or has an empty required string property: '${prop}'.` });
      });

      it(`should return invalid if required property '${prop}' is an empty string`, () => {
        const rule = createValidRule({ [prop]: '   ' });
        expect(validateRules([rule])).toEqual({ isValid: false, error: `Rule #1 is missing or has an empty required string property: '${prop}'.` });
      });

      it(`should return invalid if required property '${prop}' is not a string`, () => {
        const rule = createValidRule({ [prop]: 123 });
        expect(validateRules([rule])).toEqual({ isValid: false, error: `Rule #1 is missing or has an empty required string property: '${prop}'.` });
      });
    });

    it('should return invalid for a non-numeric string in cooldown_seconds', () => {
      const rules = [createValidRule({ cooldown_seconds: 'abc' })];
      expect(validateRules(rules)).toEqual({ isValid: false, error: "Rule #1 has a non-numeric string for 'cooldown_seconds': 'abc'." });
    });

    it('should return invalid for a non-numeric or non-string type in delay_seconds', () => {
      const rules = [createValidRule({ delay_seconds: {} })];
      expect(validateRules(rules)).toEqual({ isValid: false, error: "Rule #1 has an invalid type for 'delay_seconds'. Expected a number or a numeric string." });
    });
  });
});
