import globals from '../configs/globals.js';
import { check } from './checks.js';
import nodejq  from 'node-jq';
import axios from 'axios';
import { resolve, join } from 'path';
import fs from 'fs-extra';
import csvParseSync from 'csv-parse/lib/sync.js';
import colors from 'colors/safe.js';
import sjcl from 'sjcl';
import Canvas from 'canvas';

//global configs
const _token = globals.TOKEN || "";
const _max_retries = globals.REQUEST_RETRIES || 20;
const _req_timeout = globals.REQUEST_TIMEOUT || 15000;
const _con_timeout = _req_timeout+3000;
const _target_dir = globals.TARGET_DIR || "";

/**
 * get  axios get request with options and
 * cancelation.
 * 
 * @param {string}  next endpoint url.
 */
export async function get(next) {
  //request cancelation
  let CancelToken = axios.CancelToken;
  let source = CancelToken.source();
  let timeout = setTimeout(() => {
    source.cancel(`connection timeout of ${_con_timeout}ms exceeded`);
  }, _con_timeout);
  //request options
  let options = {
    headers: {'Authorization': `Token ${_token}`}, 
    timeout: _req_timeout,
    cancelToken: source.token
  };
  //request
  let result = await axios.get(next, options)
  .then(
    //resolved
    (response) => {
      //check
      if(!response||!response.data){done = true; throw new Error('no response data')};
      
      //ok
      process.stdout.write("... done\n");
      return response.data;
    },
    //rejected
    (error) => { throw error })
  .catch((error) => { throw error });
  //clear
  clearTimeout(timeout);

  return result;
}

/**
 * toJqSelectBody  builds and returns a Jq select argument
 * from the arguments.
 * 
 * @param {string}  key an object's key name.
 * @param {array}   values array of values.
 * @param {string}  compOp comparison operator.
 * @param {string}  logiOp logical operator.
 */
export async function toJqSelectBody(key, values, compOp, logiOp) {
  //check
  if(!key || typeof key !== 'string')       throw new Error('expected string in @key');
  if(!values || !Array.isArray(values))     throw new Error('expected array in @values');
  if(!compOp || typeof compOp !== 'string') throw new Error('expected string in @compOp');
  if(!logiOp || typeof logiOp !== 'string') throw new Error('expected string in @logiOp');
  //warns
  if(!values.length) { console.warn("@values array has no elements"); return ''; }

  let stms = [];
  for(let i=0; i<values.length; i++) {
    let v = (typeof values[i] === 'string') 
    ? stms.push(`.${key}${compOp}"${values[i]}"`)
    : stms.push(`.${key}${compOp}${values[i]}`);
  }
  return stms.join(logiOp);
}

/**
 * applyFilters  apply given filters to given items.
 * 
 * @param {object}  filters an object with filters.
 * @param {array}   items array of items.
 */
export async function applyFilters(filters, items) {
  //check
  if(!filters || typeof filters!=='object') throw new Error('expected object in @filters');
  if(!items || !Array.isArray(items))       throw new Error('expected array in @items');
  //warns
  if(!items.length) { console.warn("@items array has no elements"); return []; }
  
  let _filtered_items = [...items];
  /**
   * -----------
   * filter: jq
   * -----------
   */
  if(filters.jq) {
    //check
    if(typeof filters.jq !== 'string' && !Array.isArray(filters.jq)) throw new Error('expected string or array in @filters.jq');
    
    let jq = (typeof filters.jq === 'string') ? [filters.jq] : filters.jq;
    let done = false;
    //for each jq filter
    for(let i=0; i<jq.length; i++) {
      let jq_result = await nodejq.run(jq[i], JSON.stringify(_filtered_items), { input: 'string', output: 'json' }).catch((err) => {throw `!! jq.run() error:\n${err}`});
      //check      
      if(!jq_result) { done = true; continue; }
      //set
      _filtered_items = (Array.isArray(jq_result)) ? [...jq_result] : [jq_result];
    }
  }//end: filter: jq
  
  return _filtered_items;
}

/**
 * findAttachment() seek image name in attachments and returns
 * the attachment object that match or null if no match was found.
 * 
 * @param {string} name image name.
 * @param {array} attachments attachment array.
 * @param {int} id instance or submission id.
 */
export function findAttachment(name, attachments, id) {
  //check
  if(name && typeof name !== 'string') throw new Error('expected string in @name');
  if(attachments && !Array.isArray(attachments)) throw new Error('expected array in @attachments');
  if(typeof id !== 'number') throw new Error('expected number in @id');
  
  //empty cases
  if(!name) return null;
  if(!attachments || attachments.length === 0) return null;

  //for each attachment
  let result = null;
  for(let i=0; i<attachments.length; i++) {
    let attachment = attachments[i];
    
    //checks
    if(!attachment || typeof attachment !== 'object') { console.log(`@@ error: expected object in @attachments element... excluded`); continue; }
    if(!attachment.mimetype || typeof attachment.mimetype !== 'string') { console.log(`@@ error: expected string in @attachment.mimetype... excluded`); continue; }
    if(!attachment.download_url || typeof attachment.download_url !== 'string') { console.log(`@@ error: expected string in @attachment.download_url... excluded`); continue; }
    if(!attachment.filename || typeof attachment.filename !== 'string') { console.log(`@@ error: expected string in @attachment.filename... excluded`); continue; }
    if(!attachment.instance || typeof attachment.instance !== 'number') { console.log(`@@ error: expected number in @attachment.instance... excluded`); continue; }
    if(!attachment.id || typeof attachment.id !== 'number') { console.log(`@@ error: expected number in @attachment.id... excluded`); continue; }

    //check: mimetype
    if(!/^image/.test(attachment.mimetype)) continue;

    //check: filename
    let liofn = attachment.filename.lastIndexOf(name);
    if(liofn === -1 || liofn !== (attachment.filename.length - name.length)) continue; //no match
    else {//match
      if(!result) result = {...attachment}; //first attachment
      else {//non-first attachment
        //check attachment.id: greater id is kept
        if(attachment.id > result.id) result = {...attachment};
        else continue;
      }
    }
  }//end: for each attachment

  return result;
}

/**
 * getTargetDir() check if TARGET_DIR is defined, and exists.
 * If defined but not exists, throws and error. If no defined
 * creates a new directory with default name: 'out_timestamp'.  
 * 
 * @return {string} target dir name.
 */
export function getTargetDir() {
  //case: TARGET_DIR defined
  if(_target_dir) {
    //check
    if(typeof _target_dir !== 'string') throw new Error('expected string in @TARGET_DIR');

    let t_dir = resolve(_target_dir);
    if(fileExists(t_dir)) return t_dir; //exists
    else {
      //msg
      console.log(`@@ TARGER_DIR does not exists: ${t_dir}`);
      //make dir
      makeDirPath(t_dir);
      console.log(`@@ TARGER_DIR created: ${t_dir}`);
      //msg
    }

  } else { //case: default target
    
    let d = './out_'+getCurrentTimestamp();
    let t_dir = resolve(d);
    let max_tries = 100;
    let tries = 1;

    while(fileExists(t_dir)&&(tries<=max_tries)) {
      d = './out_'+getCurrentTimestamp()+'-'+String(tries);
      t_dir = resolve(d);
      tries++;
    }
    //check
    if(fileExists(t_dir)) throw new Error('very bad error in here');

    //make dir
    t_dir = makeDirPath(t_dir);
    return t_dir;
  }
}

export function renameIfExists(filePath) {
  //internal
  check(filePath, 'mustExists', 'string');

  let ext_i = filePath.lastIndexOf('.');
  let ext = (ext_i > 0) ? filePath.slice(ext_i) : '';
  let noExt = (ext_i > 0) ? filePath.slice(0, ext_i) : filePath;

  let _path = resolve(filePath);
  let max_tries = 1000;
  let tries = 1;

  while(fileExists(_path)&&(tries<=max_tries)) {
    _path = resolve(noExt + '_' + String(tries) + ext);
    tries++;
  } 
  //check
  if(fileExists(_path)) throw new Error('could not rename file: ' + filePath);

  return _path;
}

export function fileExists(filePath) {
  //internal
  check(filePath, 'mustExists', 'string');

  try {
    let _path = resolve(filePath);
    fs.accessSync(_path, fs.constants.F_OK);
    return fs.lstatSync(_path).isFile();
  } catch (e) {
    return false;
  }
}

export function dirExists(dirPath) {
  //internal
  check(dirPath, 'mustExists', 'string');

  try {
    let _path = resolve(dirPath);
    fs.accessSync(_path, fs.constants.F_OK);    
    return fs.lstatSync(_path).isDirectory();
  } catch (e) {
    return false;
  }
}

export function pathExists(path) {
  // check if the file exists
  try {
    let _path = resolve(path);
    fs.accessSync(_path, fs.constants.F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

export function makeDirPath(dirPath) {
  let _path = null;
  try {
    _path = resolve(dirPath);
  } catch (e) {
    console.error(e);
    throw new Error(`trying to resolve path fails: ${dirPath}`);
  }

  // if path exists
  if(dirExists(_path)) return false;

  //make path
  try {
    fs.mkdirSync(_path, { recursive: true, mode: 0o1775 });
    return _path;
  } catch (e) {
    console.error(e);
    throw new Error(`trying to make path fails: ${_path}`);
  }
}

export function writeFile(filePath, data) {
  //internal check
  if(!filePath || typeof filePath !== 'string') throw new Error('expected string in @filePath');
  if(!data || typeof data !== 'string') throw new Error('expected string in @data');

  //resolve path
  let _path = null;
  try {
    _path = resolve(filePath);
  } catch (e) {
    console.error(e);
    throw new Error(`trying to resolve path fails: ${filePath} - error: ${e.message}`);
  }

  //write
  try {
    /**
     * Write new file even if it exists.
     */
    fs.writeFileSync(_path, data, {mode: 0o1664});
    return _path;
  } catch (e) {
    throw new Error(`trying to write file fails: ${_path} - error: ${e.message}`);
  }
}

export function deletePath(d_path) {
  //internal check
  if(!d_path || typeof d_path !== 'string') throw new Error(`expected string in @d_path`);
  
  // resolve path
  let _path = null;
  try {
    _path = resolve(d_path);
  } catch (e) {
    throw new Error(`trying to resolve path fails: ${d_path} - error: ${e.message}`);
  }
  
  // check if the file exists
  try {
    fs.accessSync(_path, fs.constants.F_OK);
  } catch (e) {
    return false;
  }

  // delete
  try {
    fs.rmSync(_path, {force: true, recursive: true, maxRetries: 10, retryDelay: 500});
    return true;
  } catch (e) {
    throw new Error("trying to delete path fails - error: " + e.message);
  }
}

export function mvFile(oldPath, newPath) {
  //internal
  check(oldPath, 'mustExists', 'string');
  check(newPath, 'mustExists', 'string');
  
  // resolve path
  let _old_path = null;
  try {
    _old_path = resolve(oldPath);
  } catch (e) {
    throw new Error(`trying to resolve path fails: ${oldPath} - error: ${e.message}`);
  }
  // resolve path
  let _new_path = null;
  try {
    _new_path = resolve(newPath);
  } catch (e) {
    throw new Error(`trying to resolve path fails: ${newPath} - error: ${e.message}`);
  }

  // rename
  try {
    fs.renameSync(_old_path, _new_path);
    return true;
  } catch (e) {
    throw new Error("trying to rename path fails - error: " + e.message);
  }
}

export function toPath(entries) {
  let _entries = entries.map(e => String(e));
  return join(..._entries);
}

export function getDirEntries(dirPath, options) {
  //internal check
  if(!dirPath || typeof dirPath !== 'string') throw new Error(`expected string in @dirPath`);
  if(options && typeof options !== 'object') throw new Error(`expected object in @options`);

  let dirsOnly = options.dirsOnly ? options.dirsOnly : false;
  let filesOnly = options.filesOnly ? options.filesOnly : false;
  let numericOnly = options.numericOnly ? options.numericOnly : false;

  //check
  if(dirsOnly && filesOnly) throw new Error(`'dirsOnly' and 'filesOnly' are mutual exclusive options`);

  // resolve path
  let t_path = null;
  try {
    t_path = resolve(dirPath);
  } catch (e) {
    throw new Error(`trying to resolve path fails: ${dirPath} - error: ${e.message}`);
  }

  try {
    let dirs = fs.readdirSync(t_path, { withFileTypes: true });
    /**
     * Filters:
     *  1. entry type: only directories.
     *  2. entry name: dir names with positive integer values (without leading 0s) or 0.
     */
    if(dirsOnly)    dirs = dirs.filter(dirent => dirent.isDirectory());
    if(filesOnly)   dirs = dirs.filter(dirent => dirent.isFile());
    if(numericOnly) dirs = dirs.filter(dirent => /^([1-9][0-9]*)|([0])$/.test(dirent.name));
    
    dirs = dirs.map(dirent => dirent.name);
    return dirs;

  } catch (e) {
    throw new Error("trying to get dir entries fails: " + e.message);
  }
}
/**
 * getCurrentTimestamp returns formated current timestamp.
 */
export function getCurrentTimestamp() {
  let d = new Date(Date.now());
  let yyyy = d.getFullYear();
  let MM = (d.getMonth() + 1);
  let dd = d.getDate();
  let hh = d.getHours();
  let mm = d.getMinutes();
  let ss = d.getSeconds();

  if (MM.length < 2) 
      MM = '0' + mm;
  if (dd.length < 2) 
      dd = '0' + dd;

  return [yyyy, MM, dd, hh, mm, ss].join('-');
}

/**
 * escapeRegExp escape special regexp chars in string or strings.
 * 
 * @param {string|array} input string or array of strings to be escaped. 
 */
export function escapeRegExp(input) {
  //internal check
  if(!input || (typeof input !== 'string' && (!Array.isArray(input) || input.length === 0))) throw new Error('expected non-empty string or array in @input');

  //case: string
  if(typeof input === 'string') return input.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  else { //case: array
    let strings = [];
    for(let i=0; i<input.length; i++) {
      let string = input[i];
      //internal check
      if(!string || typeof string !== 'string') throw new Error('expected array of strings in @input');
      strings.push(string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'));
    }
    return strings;
  }
}

export function getConfigs(file) {
  //internal check
  if(file && typeof file !== 'string') throw new Error('expected string in @file');
  //check
  if(!file) return {};

  let configs = parseJSONFile(file);
  checkConfigs(configs);

  //get total submission ids
  for(let i=0; i<configs.filters.length; i++) {
    let filter = configs.filters[i];
    filter._submissionIds = getSubmissionIds(filter.submissionIdsCsv, filter.submissionIds);
  }

  return configs;
}

/**
 * getSubmissionIds - get total submission ids.
 * @param {string} submissionIdsCsv
 * @param {array}  submissionIds
 */
function getSubmissionIds(submissionIdsCsv, submissionIds) {
  //internal check
  if(submissionIdsCsv && typeof submissionIdsCsv !== 'string') throw new Error('expected string in @submissionIdsCsv');
  if(submissionIds && !Array.isArray(submissionIds)) throw new Error('expected array in @submissionIds');

  let _submissionIds = [];

  //add ids from @submissionIds
  if(submissionIds) addSubmissionIds(submissionIds, _submissionIds);

  //add ids from @submissionIdsCsv
  if(submissionIdsCsv) {
    let sids = getSubmissionIdsFromCsv(submissionIdsCsv);
    addSubmissionIds(sids, _submissionIds);
  }

  return _submissionIds;
}

function getSubmissionIdsFromCsv(submissionIdsCsv, idColumn, delimiter) {
  //internal check
  if(submissionIdsCsv && typeof submissionIdsCsv !== 'string') throw new Error('expected string in @submissionIdsCsv');
  if(delimiter && typeof delimiter !== 'string') throw new Error('expected string in @delimiter');
  if(idColumn && typeof idColumn !== 'string') throw new Error('expected string in @idColumn');
  
  let data = null;
  let records = null;
  let _idColumn = (idColumn) ? idColumn : 'id';
  let _delimiter = (delimiter) ? delimiter : ',';
  let _file = resolve(submissionIdsCsv);
  let ids = [];
  let errors = [];

  //check
  if(!fileExists(_file)) throw new Error(`file does not exists: ${_file}`);

  //read
  try {
    data = fs.readFileSync(_file, 'utf8');
  } catch (e) {
    throw new Error(`file read operation failed: ${_file}\n` + e.message);
  }

  //parse
  try {
    records = csvParseSync(data, {
      columns: false,
      skip_empty_lines: true,
      delimiter: _delimiter
    })
    //check
    if(!records) throw new Error('csv parsed result is null');
    if(!Array.isArray(records)) throw new Error('csv parsed result is not an array');
    if(records.length === 0) throw new Error('csv parsed result is empty');
  } catch (e) {
    throw new Error(`CSV parse operation failed: ` + e.message);
  }
  //check
  if(records.length === 1) throw new Error('csv parsed results has not data');

  //get headers
  let headers = records[0];
  //check
  if(!headers || !Array.isArray(headers)) throw new Error('expected array in csv @headers');

  //check _id column
  let idColumnCount = 0;
  let idColumnIndex = -1;
  for(let i=0; i<headers.length; i++) {
    let h = headers[i];
    if(h === _idColumn) { idColumnCount++; idColumnIndex = i };
  }
  //check
  if(idColumnCount === 0) throw new Error(`column '${_idColumn}' not found in csv @headers`);
  if(idColumnCount > 1) throw new Error(`column '${_idColumn}' found more than once in csv @headers`);

  //get ids
  for(let i=1; i<records.length; i++) {
    let r = records[i];
    //check
    if(!r || !Array.isArray(r)) throw new Error(`expected array in csv @records`);
    if(!r[idColumnIndex]) errors.push(`id is empty - in csv @records entry ${i}`);
    else {
      let _id = Number.parseFloat(r[idColumnIndex]);
      if(Number.isNaN(_id)) errors.push(`id '${r[idColumnIndex]}' is not a number - in csv @records entry ${i}`);
      else if(!Number.isInteger(_id)) errors.push(`id '${r[idColumnIndex]}' is not int - in csv @records entry ${i}`);
    }

    ids.push(r[idColumnIndex]);
  }

  if(errors.length > 0) throw new Error(`csv file has errors: \n${JSON.stringify(errors, null, 2)}\n`);
  else return ids;
}

function addSubmissionIds(submissionIds, _submissionIds) {
  //internal check
  if(!submissionIds || !Array.isArray(submissionIds)) throw new Error('expected array in @submissionIds');
  if(!_submissionIds || !Array.isArray(_submissionIds)) throw new Error('expected array in @_submissionIds');

  let errors = [];

  //for each entry in @submissionIds
  for(let i=0; i<submissionIds.length; i++) {
    let id = submissionIds[i];
    //check
    if(!Number.isInteger(id) && typeof id !== 'string') errors.push(`int or string parsable to int expected - in @submissionIds entry ${i}`);
    else {
      //case: int
      if(Number.isInteger(id) && !_submissionIds.includes(id)) _submissionIds.push(id);
      else {
        //case: string
        let _id = Number.parseFloat(id);
        if(Number.isNaN(_id)) errors.push(`id '${id}' is not a number - in @submissionIds entry ${i}`);
        else if(!Number.isInteger(_id)) errors.push(`id '${id}' is not int - in @submissionIds entry ${i}`);
        else if(!_submissionIds.includes(_id)) _submissionIds.push(_id);
      }
    }
  }//end: for each entry in @submissionIds

  if(errors.length > 0) throw new Error(`submissionIds has errors: \n${JSON.stringify(errors, null, 2)}\n`);
  else return true;
}

/**
 * checkConfigs - Check configs object.
 * @param {object} configs 
 */
function checkConfigs(configs) {
  //internal check
  if(configs && typeof configs !== 'object') throw new Error('expected object in @configs');
  //check
  if(!configs) return {};

  let errors = [];
  let valid_keys = ['filters'];
  let valid_filters_keys = ['assetId', 'submissionIdsCsv', 'submissionIds'];

  //check: keys
  let o_keys = Object.keys(configs);
  for(let i=0; i<o_keys.length; i++) {
    if(!valid_keys.includes(o_keys[i])) errors.push(`not valid key in configs: '${o_keys[i]}'`);
  }

  //check: filters
  if(!configs.filters) configs.filters = [];
  else {
    //check
    if(!Array.isArray(configs.filters)){
      errors.push(`expected array in @filters`);
    } else {
      //for each filter entry
      for(let i=0; i<configs.filters.length; i++) {
        let filter = configs.filters[i];

        //check
        if(!filter || typeof filter !== 'object') {
          errors.push(`expected object - in @filters entry ${i}`);
        } else {

          //check: keys
          let o_keys = Object.keys(filter);
          for(let j=0; j<o_keys.length; j++) {
            if(!valid_filters_keys.includes(o_keys[j])) errors.push(`not valid key in configs.filters: '${o_keys[j]}'`);
          }

          //check: assetId
          if(filter.assetId === undefined) errors.push(`mandatory key 'assetId' is not defined - in @filters entry ${i}`);
          else if(filter.assetId === null) errors.push(`string expected in key 'assetId' but is null - in @filters entry ${i}`);
          else if(filter.assetId === '') errors.push(`non-empty string expected in key 'assetId' but is empty - in @filters entry ${i}`);
          else if(typeof filter.assetId !== 'string') errors.push(`string expected in key 'assetId' but is not a string - in @filters entry ${i}`);

          //check: submissionIdsCsv
          if(filter.submissionIdsCsv !== undefined) {
            if(filter.submissionIdsCsv === null) errors.push(`string expected in key 'submissionIdsCsv' but is null - in @filters entry ${i}`);
            else if(filter.submissionIdsCsv === '') errors.push(`string expected in key 'submissionIdsCsv' but is empty - in @filters entry ${i}`);
            else if(typeof filter.submissionIdsCsv !== 'string') errors.push(`string expected in key 'submissionIdsCsv' but is not a string - in @filters entry ${i}`);
          }

          //check: submissionIds
          if(filter.submissionIds !== undefined) {
            if(filter.submissionIds === null) errors.push(`array expected in key 'submissionIds' but is null - in @filters entry ${i}`);
            else if(!Array.isArray(filter.submissionIds)) errors.push(`array expected in key 'submissionIds' - in @filters entry ${i}`);
          }
        }//end: for each filter entry
      }
    }
  }//end: check: filters

  if(errors.length > 0) throw new Error(`configs file has errors: \n${JSON.stringify(errors, null, 2)}\n`);
  else return true;
}

/**
 * parseJSONFile - Parse a json file.
 *
 * @param  {string} file path where json file is stored
 * @return {object} json file converted to js object
 */
export function parseJSONFile(file) {
  //internal check
  if(!file || typeof file !== 'string') throw new Error('expected string in @file');
  
  let data = null;
  let o = null;
  let _file = resolve(file);

  //check
  if(!fileExists(_file)) throw new Error(`file does not exists: ${_file}`);

  //read
  try {
    data = fs.readFileSync(_file, 'utf8');
  } catch (e) {
    throw new Error(`file read operation failed: ${_file}\n` + e.message);
  }

  //parse
  try {
    o = JSON.parse(data);
  } catch (e) {
    throw new Error(`JSON parse operation failed: ${data}\n` + e.message);
  }

  return o;
}

export function printReportCounters(report) {
  //internal
  check(report, 'mustExists', 'array');

  for(let i=0; i<report.length; i++) {
    let counters = report[i].counters;
    //internal
    check(counters, 'mustExists', 'object');
    let warnKeys = ['totalWarnings', 'warnings', 'totalNones'];
    let errKeys = ['totalErrors', 'totalCleanErrors', 'errors'];

    //print counters
    let e = Object.entries(counters);
    for(let j=0; j<e.length; j++) {
      if(j === 0) process.stdout.write('  ');
      process.stdout.write(colors.white(e[j][0]) + ': ');
      if(errKeys.includes(e[j][0]))
           process.stdout.write(colors.red.bold(e[j][1]));
      else if(warnKeys.includes(e[j][0])) 
           process.stdout.write(colors.yellow.bold(e[j][1]));
      else process.stdout.write(colors.brightWhite.bold(e[j][1]));
      if(j+1 < e.length) process.stdout.write(', ');
    }
    process.stdout.write('\n');
  }
}

export function printWarnings(warnings) {
  //internal
  check(warnings, 'mustExists', 'array');

  //print warnings
  process.stdout.write('    !warnings:\n');
  for(let i=0; i<warnings.length; i++) {
    process.stdout.write(colors.white(`      ${i+1}: `) + colors.yellow(warnings[i]));
    if(i+1 < warnings.length) process.stdout.write(',\n');
  }
  process.stdout.write('\n');
}

export function getActionReportLine(submissionId, c_s, t_s, action, c_a, t_a, c_f, t_f, image_name, result_msg) {
  //internal
  check(submissionId, 'defined', 'number');
  check(c_s, 'defined', 'number');
  check(t_s, 'defined', 'number');
  check(action, 'mustExists', 'string');
  check(c_a, 'defined', 'number');
  check(t_a, 'defined', 'number');
  check(c_f, 'defined', 'number');
  check(t_f, 'defined', 'number');
  check(image_name, 'mustExists', 'string');
  check(result_msg, 'mustExists', 'string');

  //report
  let _action = action === 'keep' ? colors.green(action[0]) : (action === 'delete' ? colors.red(action[0]) : colors.yellow(action[0]));
  let progress = Math.round((c_a/t_a*100*100)+ Number.EPSILON)/100;

  return ('  ' 
  + '['
  //submission counters
  //+ colors.gray(`s:${submissionId} #${c_s}/${t_s} `)
  //action counters
  + colors.gray(`a:${_action} #`) + colors.white(c_a)+ colors.gray(`/${t_a} `)
  //field counters
  + colors.gray(`f:#`) + colors.cyan(c_f) + colors.gray(`/${t_f}`)
  +  '] ' 
  //image name
  + colors.cyan.dim.bold(image_name) + ': '
  //result 
  + colors.gray(result_msg) 
  //progress
  + `  ${progress}%` 
  + '\n');
}

export function getHash(data) {
  //internal
  check(data, 'mustExists', 'string');
  try {
    return sjcl.hash.sha256.hash(data);
  } catch (error) {
    throw new Error(`getHash operation failed:` + e.message);
  }
}

export function getFileHash(file) {
  //internal
  check(file, 'mustExists', 'string');

  let data = null;
  let o = null;
  let _file = null;

  //resolve
  try {
    _file = resolve(file);
  } catch (e) {
    throw new Error(`getFileHash operation failed: trying to resolve path fails: ${file}`);
  }

  //check
  if(!fileExists(_file)) throw new Error(`getFileHash operation failed: file does not exists: ${_file}`);

  //read
  try {
    data = fs.readFileSync(_file, 'utf8');
  } catch (e) {
    throw new Error(`getFileHash operation failed: read failed: ${_file} - ` + e.message);
  }

  //hash
  try {
    return sjcl.hash.sha256.hash(data);
  } catch (e) {
    throw new Error(`getFileHash operation failed: hash failed - ` + e.message);
  }
}

export function isValidHash(data, hash) {
  //internal
  check(data, 'mustExists', 'string');
  check(hash, 'mustExists', 'array');
  
  try {
    //get data hash
    let _hash = sjcl.hash.sha256.hash(data)
    //internal
    check(_hash, 'mustExists', 'array');

    //check
    if(_hash.length !== hash.length) return false;
    
    //check
    for(let i=0; i<hash.length; i++) {
      if(_hash[i] !== hash[i]) return false;
    }
    return true;
  } catch (e) {
    throw new Error(`isValidHash operation failed: ` + e.message);
  }
}

export function isValidFileHash(file, hash) {
  //internal
  check(file, 'mustExists', 'string');
  check(hash, 'mustExists', 'array');

  try {
    //get file hash
    let _hash = getFileHash(file);
    //internal
    check(_hash, 'mustExists', 'array');

    //check
    if(_hash.length !== hash.length) return false;
    
    //check
    for(let i=0; i<hash.length; i++) {
      if(_hash[i] !== hash[i]) return false;
    }
    return true;
  } catch (e) {
    throw new Error(`isValidFileHash operation failed: ` + e.message);
  }
}

export function buildImageName(prefix, name) {
  //internal
  check(prefix, 'mustExists', 'string');
  check(name, 'mustExists', 'string');

  return prefix + '_' + name;
}

export async function getImgInfo(file) {
  //internal
  check(file, 'mustExists', 'string');

  let data = null;
  let o = null;
  let _file = null;
  let imgInfo = {};

  //resolve
  try {
    _file = resolve(file);
  } catch (e) {
    throw new Error(`getImgInfo operation failed: trying to resolve path fails: ${file}`);
  }

  //check
  if(!fileExists(_file)) throw new Error(`getImgInfo operation failed: file does not exists: ${_file}`);

  //read
  try {
    data = fs.readFileSync(_file, 'utf8');
  } catch (e) {
    throw new Error(`getImgInfo operation failed: read failed: ${_file} - ` + e.message);
  }

  //hash
  // try {
  //   imgInfo.hash = sjcl.hash.sha256.hash(data);
  // } catch (e) {
  //   throw new Error(`getImgInfo operation failed: hash failed - ` + e.message);
  // }

  //canvas
  try {
    
    let result = await new Promise((resolve, reject) => {

    var img = new Canvas.Image(); // Create a new Image
    img.onload = () => { 
      const canvas = Canvas.createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d')

      // console.log("@img: ", img.width, ' x ', img.height);
      // console.log("@img: ", img.naturalWidth, ' x ', img.naturalHeight);
      // console.log("@img: ", img);

      imgInfo.width = img.width;
      imgInfo.height = img.height;

      //console.log("@ data.l-2: ", data.length);
      imgInfo.size = data.length;
      resolve();

    }
    img.onerror = err => { throw err }
    img.src = file;

  });



  } catch (e) {
    throw new Error(`getImgInfo operation failed: img canvas - on file: ${_file} - ` + e.message);
  }

  return imgInfo;
}