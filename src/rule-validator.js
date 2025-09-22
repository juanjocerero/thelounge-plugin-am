'use strict';

/**
 * Validates an array of rule objects against the required schema.
 * This function mutates the rule objects in place by casting numeric string values to numbers.
 * @param {any} rules - The parsed JSON data to validate.
 * @returns {{isValid: boolean, error?: string}}
 */
function validateRules(rules) {
  if (!Array.isArray(rules)) {
    return { isValid: false, error: 'The provided rules data is not an array.' };
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    if (typeof rule !== 'object' || rule === null) {
      return { isValid: false, error: `Rule #${i + 1} is not a valid object.` };
    }

    const requiredStrings = ['server', 'listen_channel', 'trigger_text', 'response_text'];
    for (const prop of requiredStrings) {
      if (typeof rule[prop] !== 'string' || rule[prop].trim() === '') {
        return { isValid: false, error: `Rule #${i + 1} is missing or has an empty required string property: '${prop}'.` };
      }
    }

    const numericFields = ['cooldown_seconds', 'delay_seconds'];
    for (const field of numericFields) {
      if (rule.hasOwnProperty(field)) {
        const originalValue = rule[field];
        
        if (typeof originalValue === 'string' && originalValue.trim() !== '') {
          const parsedValue = Number(originalValue);
          if (isNaN(parsedValue)) {
            return { isValid: false, error: `Rule #${i + 1} has a non-numeric string for '${field}': '${originalValue}'.` };
          }
          rule[field] = parsedValue; // Mutate the object with the correct type
        } else if (typeof originalValue !== 'number') {
          return { isValid: false, error: `Rule #${i + 1} has an invalid type for '${field}'. Expected a number or a numeric string.` };
        }
      }
    }
  }

  return { isValid: true };
}

module.exports = {
  validateRules,
};
