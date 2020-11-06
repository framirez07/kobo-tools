/**
 * check  Do checks to arguments.
 * @param {any} arg argument to check.
 * @param {string} condition check condition.
 * @param {string} expectedType expected type of @arg.
 */
export function check(arg, condition, expectedType) {
  //internal check
  if(!condition || typeof condition !== 'string') throw new Error(`expected string in @condition: ${condition}`);
  if(!expectedType || typeof expectedType !== 'string') throw new Error(`expected string in @expectedType: ${expectedType}`)

  switch(condition) {
    case 'ifExists':
      if(arg && !isOfType(arg, expectedType)) throw new Error(`expected ${expectedType} in @arg: ${arg}`);
      break;
    case 'mustExists':
      if(!arg || !isOfType(arg, expectedType)) throw new Error(`expected ${expectedType} in @arg: ${arg}`);
      break;
    case 'ifDefined':
      if((arg !== undefined) && !isOfType(arg, expectedType)) throw new Error(`expected ${expectedType} in @arg: ${arg}`);
      break;
    case 'defined':
      if((arg === undefined) || !isOfType(arg, expectedType)) throw new Error(`expected ${expectedType} in @arg: ${arg}`);
      break;
    case 'type':
      if(!isOfType(arg, expectedType)) throw new Error(`expected ${expectedType} in @arg: ${arg}`);
      break;
  
    default:
      throw new Error(`unknown @condition: ${condition}`);
  }
}

/**
 * isOfType  Check if the @arg is of type @type.
 * @param {any} arg argument to check.
 * @param {string} type type which will be check on @arg.
 */
export function isOfType(arg, type) {
  //internal check
  if(!type || typeof type !== 'string') throw new Error(`expected string in @type: ${type}`)

  switch(type) {
    case 'array':
      return Array.isArray(arg);
    case 'string':
    case 'number':
    case 'boolean':
    case 'object':
    case 'function':
      return typeof arg === type;
    default:
      throw new Error(`unknown @type: ${type}`);
  }
}