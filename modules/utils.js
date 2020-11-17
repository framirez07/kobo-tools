import { check, confirm, isOfType } from './checks.js';
import { resolve, join } from 'path';
import fs from 'fs-extra';
import nodejq  from 'node-jq';
import colors from 'colors/safe.js';
import sjcl from 'sjcl';
import Canvas from 'canvas';

/**
 * toJqSelectBody  builds and returns a Jq select argument
 * from the arguments.
 * 
 * @param {string}  key an object's key name.
 * @param {array}   values array of values.
 * @param {string}  compOp comparison operator.
 * @param {string}  logiOp logical operator.
 */
export function toJqSelectBody(key, values, compOp, logiOp) {
  //internal
  check(key, 'mustExists', 'string');
  check(values, 'mustExists', 'array');
  check(compOp, 'mustExists', 'string');
  check(logiOp, 'mustExists', 'string');
  if(!values.length) throw new Error(`expected non empty array on @arg`);

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
  //internal
  check(filters, 'mustExists', 'object');
  check(items, 'mustExists', 'array');
  
  //case: no items
  if(!items.length) return [];
  
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
 * If the given image name has more than one attachment entry,
 * then the one with the greater id will be returned.
 * 
 * @param {string} name image name.
 * @param {array} attachments attachment array.
 * @param {int} id instance or submission id.
 */
export function findAttachment(name, attachments, id) {
  //internal
  check(name, 'mustExists', 'string');
  check(attachments, 'mustExists', 'array');
  check(id, 'defined', 'number');
  
  //empty cases
  if(!name) return null;
  if(!attachments || attachments.length === 0) return null;

  //for each attachment
  let result = null;
  for(let i=0; i<attachments.length; i++) {
    let attachment = attachments[i];
    //internal
    check(attachment, 'mustExists', 'object');
    check(attachment.mimetype, 'mustExists', 'string');
    check(attachment.download_url, 'mustExists', 'string');
    check(attachment.filename, 'mustExists', 'string');
    check(attachment.instance, 'defined', 'number');
    check(attachment.id, 'defined', 'number');
    
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
 * 
 * @param {string} filePath filename that will be checked for existence.
 * If @filePath exists, this function will return @filePath with a 
 * number added as a postfix (but before extension).
 */
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

/**
 * fileExists  checks if given file exists.
 * @param {string} filePath filename to be checked.
 */
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

/**
 * dirExists  checks if given directory exists.
 * @param {string} dirPath 
 */
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

/**
 * pathExists  checks if the given path exists.
 * @param {string} path path to be checked.
 */
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

/**
 * makeDirPath  makes path.
 * @param {string} dirPath path to be made.
 */
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

/**
 * writeFile  writes data into file.
 * @param {string} filePath file to write into.
 * @param {string} data data to write.
 * @param {object} options configurations.
 */
export function writeFile(filePath, data, options) {
  //internal
  check(filePath, 'mustExists', 'string');
  check(data, 'mustExists', 'string');
  check(options, 'ifExists', 'object');

  //options
  let _async = (options&&options.async) ? options.async : false;

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
    if(_async) fs.writeFile(_path, data, {mode: 0o1664}, (err) => { if (err) throw err;});
    else fs.writeFileSync(_path, data, {mode: 0o1664});

    return _path;
  } catch (e) {
    throw new Error(`trying to write file fails: ${_path} - error: ${e.message}`);
  }
}

/**
 * appendFile  appends data to file.
 * @param {string} filePath file to append into.
 * @param {string} data data to be appended.
 * @param {object} options configurations.
 */
export function appendFile(filePath, data, options) {
  //internal
  check(filePath, 'mustExists', 'string');
  check(data, 'mustExists', 'string');
  check(options, 'ifExists', 'object');

  //options
  let onNewLine = (options&&options.onNewLine) ? options.onNewLine : false;
  let _async = (options&&options.async) ? options.async : false;
  
  //resolve path
  let _path = null;
  try {
    _path = resolve(filePath);
  } catch (e) {
    console.error(e);
    throw new Error(`trying to resolve path fails: ${filePath} - error: ${e.message}`);
  }

  //append
  try {
    /**
     * Append to file or create a new file if not exists.
     */
    let _data = (onNewLine) ? '\n'+data : data;
    if(_async) fs.appendFile(_path, _data, {mode: 0o1664}, (err) => { if (err) throw err;});
    else fs.appendFileSync(_path, _data, {mode: 0o1664});

    return _path;
  } catch (e) {
    throw new Error(`trying to write file fails: ${_path} - error: ${e.message}`);
  }
}

/**
 * deletePath  deletes a path (file or directory).
 * @param {string} d_path path to be deleted.
 */
export function deletePath(d_path) {
  //internal
  check(d_path, 'mustExists', 'string');
  
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

/**
 * mvFile  renames a file.
 * @param {string} oldPath name of the current file to ve renamed.
 * @param {string} newPath new file's name.
 */
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

/**
 * toPath  returns a path string from given entries.
 * @param {array} entries array to be converted to path.
 */
export function toPath(entries) {
  //internal
  check(entries, 'mustExists', 'array');
  
  let _entries = entries.map(e => String(e));
  return join(..._entries);
}

/**
 * getDirEntries  returns an array with the names of the
 * entries  in target directory, filtered by given options.
 * @param {string} dirPath path of the target directory.
 * @param {object} options configurations.
 */
export function getDirEntries(dirPath, options) {
  //internal
  check(dirPath, 'mustExists', 'string');
  check(options, 'mustExists', 'object');
  
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
 * getCurrentTimestamp  returns formated current timestamp.
 * @param {object} options configurations
 */
export function getCurrentTimestamp(options) {
  //internal
  check(options, 'ifExists', 'object');
  
  let d = new Date(Date.now());
  let yyyy = d.getFullYear().toString();
  let MM = (d.getMonth() + 1).toString();
  let dd = d.getDate().toString();
  let hh = d.getHours().toString();
  let mm = d.getMinutes().toString();
  let ss = d.getSeconds().toString();
  let mmm= d.getMilliseconds().toString();

  if (MM.length < 2)
      MM = '0' + mm;
  if (dd.length < 2)
      dd = '0' + dd;
  if (hh.length < 2)
      hh = '0' + hh;
  if (mm.length < 2)
      mm = '0' + mm;
  if (ss.length < 2)
      ss = '0' + ss;
  if (mmm.length < 2)
      mmm = '00' + mmm;
  else if(mmm.length < 3)
      mmm = '0' + mmm;

  if(options && options.style === 'log') return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}.${mmm}`;
  else return [yyyy, MM, dd, hh, mm, ss].join('-');
}

/**
 * escapeRegExp escape special regexp chars in string or strings.
 * @param {string|array} input string or array of strings to be escaped. 
 */
export function escapeRegExp(input) {
  //internal
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

/**
 * parseJSONFile - Parse a json file.
 * @param  {string} file path where json file is stored.
 * @return {object} js object from file.
 */
export function parseJSONFile(file) {
  //internal
  check(file, 'mustExists', 'string');
    
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

/**
 * printReportCounters  prints counters and writes to log file.
 * @param {array} report array with counters entries to report.
 * @param {string} logfile log file to write into.
 * @param {options} options configurations.
 */
export function printReportCounters(report, logfile, options) {
  //internal
  check(report, 'mustExists', 'array');
  check(logfile, 'mustExists', 'string');
  check(options, 'ifExists', 'object');

  let noTimestamp = (options&&options.noTimestamp) ? options.noTimestamp : false;

  for(let i=0; i<report.length; i++) {
    let counters = report[i].counters;
    //internal
    check(counters, 'mustExists', 'object');
    let warnKeys = ['totalWarnings', 'warnings', 'totalNones'];
    let errKeys = ['totalErrors', 'totalCleanErrors', 'errors'];

    //print counters
    let e = Object.entries(counters);
    for(let j=0; j<e.length; j++) {
      if(j === 0 && !noTimestamp) log(logfile, '', {noNewLine: true});
      //key
      log(logfile, `${colors.white(e[j][0])}: `, {noNewLine: true, noPadding: true, noTimestamp: true});
      //value
      if(errKeys.includes(e[j][0])) //case: err
        log(logfile, `${colors.red.bold(e[j][1])}`, {noNewLine: true, noPadding: true, noTimestamp: true});
      else if(warnKeys.includes(e[j][0])) //case: warn
        log(logfile, `${colors.yellow.bold(e[j][1])}`, {noNewLine: true, noPadding: true, noTimestamp: true});
      else log(logfile, `${colors.brightWhite.bold(e[j][1])}`, {noNewLine: true, noPadding: true, noTimestamp: true}); //case: normal
      if(j+1 < e.length) log(logfile, ', ', {noNewLine: true, noPadding: true, noTimestamp: true});
    }
    log(logfile, '\n', {noNewLine: true, noPadding: true, noTimestamp: true});
  }
}

/**
 * printWarnings  prints warnings and writes to log file.
 * @param {array} warnings array of warnings.
 * @param {string} logfile log file to write into.
 */
export function printWarnings(warnings, logfile) {
  //internal
  check(warnings, 'mustExists', 'array');
  check(logfile, 'mustExists', 'string');

  //check
  if(warnings.length === 0) return;

  //print warnings
  log(logfile,'!warnings:');
  for(let i=0; i<warnings.length; i++) {
    log(logfile, `${colors.white(`      ${i+1}: `) + colors.yellow(warnings[i])}`);
  }
}

/**
 * getActionReportLine  returns a report-formated line string.
 * @param {number} submissionId submission id.
 * @param {number} c_s current submission.
 * @param {number} t_s total submissions.
 * @param {string} action action name.
 * @param {number} c_a current action.
 * @param {number} t_a total actions.
 * @param {number} c_f current field.
 * @param {number} t_f total fields.
 * @param {string} image_name image's name.
 * @param {string} result_msg result message.
 */
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
  //action counters
  + colors.gray(`a:${_action} #`) + colors.white(c_a)+ colors.gray(`/${t_a} `)
  //field counters
  + colors.gray(`f:#`) + colors.cyan(c_f) + colors.gray(`/${t_f}`)
  +  '] ' 
  //image name
  + colors.cyan.dim.bold(image_name) + ': '
  //result 
  + colors.gray(result_msg)
  //total progress
  + colors.gray(`  tp:`) + colors.white(`${progress}%`)
  );
}

/**
 * getHash  calculates a hash from the fiven data.
 * @param {string} data data to be hashed.
 */
export function getHash(data) {
  //internal
  check(data, 'mustExists', 'string');
  try {
    return sjcl.hash.sha256.hash(data);
  } catch (error) {
    throw new Error(`getHash operation failed:` + e.message);
  }
}

/**
 * getFileHash  calculates hash from file.
 * @param {string} file filename to be hashed.
 */
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

/**
 * isValidHash  calculates data's hash and compares it
 * vs the given hash. Hashes needs to be equal to be
 * valid.
 * @param {string} data data to be hashed. 
 * @param {*} hash hash to be validated.
 */
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

/**
 * isValidFileHash  calculates hash to given file and compares it
 * with the given hash. Both hashes have to ve equals to be valid.
 * @param {file} file filename to which hash will be calculated
 * and validated.
 * @param {array} hash expected hash to be equal to the one that will
 * be calculated. 
 */
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

/**
 * buildImageName  returns an image name builded from
 * given arguments.
 * @param {string} prefix prefix to add to name.
 * @param {string} name image's name.
 */
export function buildImageName(prefix, name) {
  //internal
  check(prefix, 'mustExists', 'string');
  check(name, 'mustExists', 'string');

  return prefix + '_' + name;
}

/**
 * getImgInfo  calculates image's hash, and gets image's
 * width, height and dimensions.
 * @param {string} file filename of the image.
 */
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
  try {
    imgInfo.hash = sjcl.hash.sha256.hash(data);
  } catch (e) {
    throw new Error(`getImgInfo operation failed: hash failed - ` + e.message);
  }

  //canvas
  try {
    await new Promise((resolve, reject) => {
      var img = new Canvas.Image(); // Create a new Image
      img.onload = () => { 
        imgInfo.width = img.width;
        imgInfo.height = img.height;
        imgInfo.dimensions = `width: ${img.width} pixels, height: ${img.height} pixels`
        resolve();
      }
      img.onerror = err => { throw err }
      img.src = file;
    });
  } catch (e) {
    throw new Error(`getImgInfo operation failed: loading image fails - on image file: ${_file} - ` + e.message);
  }

  return imgInfo;
}

/**
 * getCsvString  returns a quoted string if it contains the separator value.
 * @param {string} str string that will be quoted if necessary.
 * @param {string} sep csv separator, default is ','.
 */
export function getCsvString(str, sep) {
  //internal
  check(str, 'mustExists', 'string');
  check(sep, 'ifExists', 'string');

  let _sep = sep ? sep : ',';

  let i = str.indexOf(_sep);
  if(i !== -1) return '"' + str.replace(/[""]/g, '\\$&') + '"';
  else return str;
}

/**
 * isValidAttachmentMap  checks @attachmentMap for validity.
 * @param {object} attachmentMap attachment map object to validate. 
 */
export function isValidAttachmentMap(attachmentMap) {
  //internal
  check(attachmentMap, 'mustExists', 'object');

  return (true
    && confirm(attachmentMap, 'exists') && isOfType(attachmentMap, 'object')
    && confirm(attachmentMap.imageName, 'exists') && isOfType(attachmentMap.imageName, 'string')
    && confirm(attachmentMap.originalName, 'exists') && isOfType(attachmentMap.originalName, 'string')
    && confirm(attachmentMap.attachmentId, 'defined') && isOfType(attachmentMap.attachmentId, 'number')
    && confirm(attachmentMap.saveTimestamp, 'exists') && isOfType(attachmentMap.saveTimestamp, 'string')
    && confirm(attachmentMap.imgInfo, 'exists') && isOfType(attachmentMap.imgInfo, 'object')
    && confirm(attachmentMap.imgInfo.assetUid, 'exists') && isOfType(attachmentMap.imgInfo.assetUid, 'string')
    && confirm(attachmentMap.imgInfo.assetName, 'exists') && isOfType(attachmentMap.imgInfo.assetName, 'string')
    && confirm(attachmentMap.imgInfo.recordId, 'defined') && isOfType(attachmentMap.imgInfo.recordId, 'number')
    && confirm(attachmentMap.imgInfo.name, 'exists') && isOfType(attachmentMap.imgInfo.name, 'string')
    && confirm(attachmentMap.imgInfo.size, 'defined') && isOfType(attachmentMap.imgInfo.size, 'number')
    && confirm(attachmentMap.imgInfo.sizeMB, 'exists') && isOfType(attachmentMap.imgInfo.sizeMB, 'string')
    && confirm(attachmentMap.imgInfo.type, 'exists') && isOfType(attachmentMap.imgInfo.type, 'string')
    && confirm(attachmentMap.imgInfo.dimensions, 'exists') && isOfType(attachmentMap.imgInfo.dimensions, 'string')
    && confirm(attachmentMap.imgInfo.width, 'defined') && isOfType(attachmentMap.imgInfo.width, 'number')
    && confirm(attachmentMap.imgInfo.height, 'defined') && isOfType(attachmentMap.imgInfo.height, 'number')
    && confirm(attachmentMap.imgInfo.hash, 'exists') && isOfType(attachmentMap.imgInfo.hash, 'array'));
}

/**
 * log  display data in console and writes data to log file.
 * @param {string} logFile log file to which data will be written.
 * @param {string} data data to be displaying in console and written
 * in log file.
 * @param {object} options configuration options. 
 */
export function log(logFile, data, options) {
  //internal
  check(logFile, 'mustExists', 'string');
  check(data, 'ifExists', 'string');
  check(options, 'ifExists', 'object');

  let _data = data ? data : '';

  //options
  let withTimestamp = (options&&options.withTimestamp) ? options.withTimestamp : false;
  let noTimestamp = (options&&options.noTimestamp) ? options.noTimestamp : false;
  let noNewLine = (options&&options.noNewLine) ? options.noNewLine : false;
  let noPadding = (options&&options.noPadding) ? options.noPadding : false;
  let logOnly = (options&&options.logOnly) ? options.logOnly : false;
  let onNewLine = (options&&options.onNewLine) ? options.onNewLine : false;

  //prepare output
  let newLine = (onNewLine) ? '\n' : '';
  let padding = (noPadding) ? '' : '  ';
  let logfilePadding = (!noTimestamp) ? `${padding}${getCurrentTimestamp({style: 'log'})}:  ` : padding;
  let logfileOutput = (noNewLine) ? `${newLine}${logfilePadding}${_data}` : `${newLine}${logfilePadding}${_data}\n`;

  let consolePadding = (withTimestamp) ? logfilePadding : padding;
  let consoleOutput = (noNewLine) ? `${newLine}${consolePadding}${_data}` : `${newLine}${consolePadding}${_data}\n`;
  
  //log to console
  if(!logOnly) process.stdout.write(consoleOutput);

  //log to file
  appendFile(logFile, logfileOutput.replace(/\u001b\[.*?m/g, ''), {async:false});
}