import { parseJSONFile, fileExists, dirExists, makeDirPath, getCurrentTimestamp } from './utils.js';
import globals from '../configs/globals.js';
import { check, confirm, isOfType } from './checks.js';
import csvParseSync from 'csv-parse/lib/sync.js';
import fs from 'fs-extra';
import { resolve, join, parse } from 'path';

/**
 * getConfigs   Calculates configurations.
 * The object returned by this function has the following
 * attributes:
 * {
 *    apiServerUrl
 *    mediaServerUrl
 *    token
 *    maxRequestRetries
 *    maxDownloadRetries
 *    requestTimeout
 *    connectionTimeout
 *    downloadTimeout
 *    mainDir
 *    outputDir
 *    filters
 * }
 * 
 * The following are the configuration points that are 
 * checked to setup the final configurations, in order 
 * of precedence:
 *  1. command line options
 *  2. environmet variables.
 *  3. run-configs json file.
 *  4. globals.js module.
 * 
 * Mandatory configurations are:
 *    API_SERVER_URL
 *    MEDIA_SERVER_URL
 * If no defined by the user, an error will be thrown.
 * 
 * @param {object} program Program module's parse result.
 * @param {string} mainDir dirname of the main js script.
 */
export function getConfigs(program, mainDir) {
  //internal
  check(program, 'mustExists', 'object');
  check(mainDir, 'mustExists', 'string');
  
  let configs = {};

  /**
   * Get run configs: --config-file
   */
  let runConfigs = {};
  if(program.configFile) {
    /**
     * lookup for configFile in:
     *  - configFile
     *  - mainDir/run-configs/
     *  - mainDIr/ 
     */
    let _lookedPaths = [];
    let _configFile_path = null;
    let _first_path = resolve(program.configFile);

    if(fileExists(_first_path)) _configFile_path = _first_path;
    else {
      _lookedPaths.push(_first_path);

      let _dir = parse(program.configFile).dir;
      if(_dir === '') {
        let _second_path = resolve(join(mainDir, "run-configs", program.configFile));
        let _third_path = resolve(join(mainDir, program.configFile));
        if(fileExists(_second_path)) _configFile_path = _second_path;
        else {
          _lookedPaths.push(_second_path);
          if(fileExists(_third_path)) _configFile_path = _third_path;
          else _lookedPaths.push(_third_path);
        }
      }
    }
    //check
    if(!_configFile_path) throw new Error(`config file not found: ${program.configFile} - in: \n${JSON.stringify(_lookedPaths, null, 2)}`);

    runConfigs = parseJSONFile(_configFile_path);
    checkRunConfigs(runConfigs, mainDir);

    //set submission ids
    for(let i=0; i<runConfigs.filters.length; i++) {
      let filter = runConfigs.filters[i];
      filter._submissionIds = getSubmissionIds(filter.submissionIdsCsv, filter.submissionIds, mainDir);
    }
  }

  /**
   * Build configurations object applying precedence 
   * and mandatory constraints.
   * 
   * {
   *    apiServerUrl    (mandatory)
   *    mediaServerUrl  (mandatory)
   *    token
   *    maxRequestRetries
   *    requestTimeout
   *    requestTimeout
   *    connectionTimeout
   *    downloadTimeout
   *    mainDir         (main js script dir)
   *    outputDir
   * 
   *    filters         (run-configs only)
   * }
   * 
   * The following are the configuration points that are 
   * checked to setup the final configurations, in order 
   * of precedence:
   * 
   *  1. command line options
   *  2. environmet variables.
   *  3. run-configs json file.
   *  4. globals.js module.
   */
  //apiServerUrl
  configs.apiServerUrl = program.apiServerUrl || process.env.KT_API_SERVER_URL || runConfigs.apiServerUrl || globals.API_SERVER_URL || null;
  if(!configs.apiServerUrl) throw new Error(`API_SERVER_URL is required, but is not defined`);

  //mediaServerUrl
  configs.mediaServerUrl = program.mediaServerUrl || process.env.KT_MEDIA_SERVER_URL || runConfigs.mediaServerUrl || globals.MEDIA_SERVER_URL || null;
  if(!configs.mediaServerUrl) throw new Error(`MEDIA_SERVER_URL is required, but is not defined`);
  
  //token
  configs.token = program.token || process.env.KT_TOKEN || runConfigs.token || globals.TOKEN || '';

  //deleteImages
  configs.deleteImages = false; //default
  if(confirm(program.deleteImages, "defined")) configs.deleteImages = true;
  else if(confirm(process.env.KT_DELETE_IMAGES, "defined")) {
    if(process.env.KT_DELETE_IMAGES.toLowerCase() === 'true') configs.deleteImages = true;
    else if(process.env.KT_DELETE_IMAGES.toLowerCase() === 'false') configs.deleteImages = false;
    else throw new Error(`KT_DELETE_IMAGES is defined, but has an invalid value: ${process.env.KT_DELETE_IMAGES}, expected boolean`);}
  else if(confirm(runConfigs.deleteImages, "defined")) configs.deleteImages = runConfigs.deleteImages;
  else if(confirm(globals.DELETE_IMAGES, "defined")) {
    if(!isOfType(globals.DELETE_IMAGES, 'boolean')) throw new Error(`gobal config DELETE_IMAGES is defined, but has an invalid value: ${globals.DELETE_IMAGES}, expected boolean`);
  }

  //maxRequestRetries
  configs.maxRequestRetries = program.maxRequestRetries || process.env.KT_MAX_REQUEST_RETRIES || runConfigs.maxRequestRetries || globals.MAX_REQUEST_RETRIES || 20;
  
  //maxDownloadRetries
  configs.maxDownloadRetries = program.maxDownloadRetries || process.env.KT_MAX_DOWNLOAD_RETRIES || runConfigs.maxDownloadRetries || globals.MAX_DOWNLOAD_RETRIES || 30;

  //requestTimeout
  configs.requestTimeout = program.requestTimeout || process.env.KT_REQUEST_TIMEOUT || runConfigs.requestTimeout || globals.REQUEST_TIMEOUT || 15000;

  //connectionTimeout
  configs.connectionTimeout = program.connectionTimeout || process.env.KT_CONNECTION_TIMEOUT || runConfigs.connectionTimeout || globals.CONNECTION_TIMEOUT || (configs.requestTimeout + 3000);

  //downloadTimeout
  configs.downloadTimeout = program.downloadTimeout || process.env.KT_DOWNLOAD_TIMEOUT || runConfigs.downloadTimeout || globals.DOWNLOAD_TIMEOUT || (configs.requestTimeout + 6000);

  //mainDir
  configs.mainDir = mainDir;

  //outputDir
  configs.outputDir = program.outputDir || process.env.KT_OUTPUT_DIR || runConfigs.outputDir || globals.OUTPUT_DIR || '';

  //filters
  configs.filters = runConfigs.filters;
  return configs;
}

/**
 * setupOutputDir  Set up output dirs tree
 * 
 * output/
 *      .attachments_map/
 *      images/
 *      data/
 *      runs/
 *          currentRun/
 *                    logs/
 *                    maps/
 *                    steps/
 *                    images_deleted/
 * 
 * keys added to configs:
 *  outputPath
 *  attachmentsMap
 *  imagesPath
 *  dataPath
 *  runsPath
 *  currentRunPath
 *  logsPath
 *  mapsPath
 *  stepsPath
 *  imagesDeletedPath
 * 
 */
export function setupOutputDir(configs) {
  check(configs, 'mustExists', 'object');
  check(configs.mainDir, 'mustExists', 'string');
  check(configs.outputDir, 'defined', 'string');

  //case: outputDir is given
  if(configs.outputDir !== '') {
    /**
     * lookup for outputDir in:
     *  - outputDir
     *  - mainDir/outputDir
     * 
     */
    let _lookedPaths = [];
    let _output_dir = null;
    let _first_path = resolve(configs.outputDir);

    if(dirExists(_first_path)) _output_dir = _first_path;
    else {
      _lookedPaths.push(_first_path);
      let _dir = parse(configs.outputDir).dir;
      if(_dir === '') {
        let _second_path = resolve(join(configs.mainDir, configs.outputDir));
        if(dirExists(_second_path)) _output_dir = _second_path;
        else _lookedPaths.push(_second_path);
      }
    }

    //check
    if(!_output_dir) throw new Error(`run dir not found: ${configs.outputDir} - in: \n${JSON.stringify(_lookedPaths, null, 2)}`);
    else configs.outputPath = _output_dir;
  } else { //case: outputDir not specified
    /**
     * Check if default dir exists, and if not, create it.
     */
    let _output_dir = resolve(join(configs.mainDir, 'runs'));
    if(dirExists(_output_dir)) configs.outputPath = _output_dir;
    else configs.outputPath = makeDirPath(_output_dir);
  }
  /**
   * Set up runs dirs tree
   * 
   * output/
   *      .attachments_map/
   *      images/
   *      data/
   *      runs/
   *          currentRun/
   *                    logs/
   *                    maps/
   *                    steps/
   *                    images_deleted/
   * 
   *  
   */
  configs.attachmentsMap = resolve(join(configs.outputPath, ".attachments_map"));
  makeDirPath(configs.attachmentsMap);

  configs.imagesPath = resolve(join(configs.outputPath, "images"));
  makeDirPath(configs.imagesPath);

  configs.dataPath = resolve(join(configs.outputPath, "data"));
  makeDirPath(configs.dataPath);

  configs.runsPath = resolve(join(configs.outputPath, "runs"));
  makeDirPath(configs.runsPath);

  //get current run dir name
  let d = './run_'+getCurrentTimestamp();
  let _current_run_path = resolve(join(configs.runsPath, d));
  let max_tries = 100;
  let tries = 1;
  //avoid repeated dir name
  while(dirExists(_current_run_path)&&(tries<=max_tries)) {
    d = './run_'+getCurrentTimestamp()+'-'+String(tries);
    t_current_run_path = resolve(d);
    tries++;
  }
  //check
  if(dirExists(_current_run_path)) throw new Error('very bad error in here');

  configs.currentRunPath = _current_run_path;
  makeDirPath(configs.currentRunPath);

  configs.logsPath = resolve(join(configs.currentRunPath, "logs"));
  makeDirPath(configs.logsPath);

  configs.mapsPath = resolve(join(configs.currentRunPath, "maps"));
  makeDirPath(configs.mapsPath);

  configs.stepsPath = resolve(join(configs.currentRunPath, "steps"));
  makeDirPath(configs.stepsPath);

  configs.imagesDeletedPath = resolve(join(configs.currentRunPath, "images_deleted"));
  makeDirPath(configs.imagesDeletedPath);

  //console.log(configs)
  return configs;
}

/**
 * getSubmissionIds - get total submission ids.
 * @param {string} submissionIdsCsv
 * @param {array}  submissionIds
 * @param {string} mainDir dirname of the main js script.
 */
function getSubmissionIds(submissionIdsCsv, submissionIds, mainDir) {
  //internal
  check(submissionIdsCsv, 'ifExists', 'string');
  check(submissionIds, 'ifExists', 'array');
  check(mainDir, 'mustExists', 'string');

  let _submissionIds = [];

  //add ids from @submissionIds
  if(submissionIds) addSubmissionIds(submissionIds, _submissionIds);

  //add ids from @submissionIdsCsv
  if(submissionIdsCsv) {
    let sids = getSubmissionIdsFromCsv(submissionIdsCsv, mainDir);
    addSubmissionIds(sids, _submissionIds);
  }

  return _submissionIds;
}

function getSubmissionIdsFromCsv(submissionIdsCsv, mainDir, idColumn, delimiter) {
  //internal
  check(submissionIdsCsv, 'mustExists', 'string');
  check(mainDir, 'mustExists', 'string');
  check(delimiter, 'ifExists', 'string');
  check(idColumn, 'ifExists', 'string');
  
  let data = null;
  let records = null;
  let _idColumn = (idColumn) ? idColumn : 'id';
  let _delimiter = (delimiter) ? delimiter : ',';
  let ids = [];
  let errors = [];

  /**
   * lookup for submissionIdsCsv file in:
   *  - submissionIdsCsv
   *  - mainDir/input/
   *  - mainDIr/ 
   */
  let _lookedPaths = [];
  let _file = null;
  let _first_path = resolve(submissionIdsCsv);

  if(fileExists(_first_path)) _file = _first_path;
  else {
    _lookedPaths.push(_first_path);

    let _dir = parse(submissionIdsCsv).dir;
    if(_dir === '') {
      let _second_path = resolve(join(mainDir, "input", submissionIdsCsv));
      let _third_path = resolve(join(mainDir, submissionIdsCsv));
      if(fileExists(_second_path)) _file = _second_path;
      else {
        _lookedPaths.push(_second_path);
        if(fileExists(_third_path)) _file = _third_path;
        else _lookedPaths.push(_third_path);
      }
    }
  }

  //check
  if(!_file) throw new Error(`submissionIdsCsv file not found: ${submissionIdsCsv} - in: \n${JSON.stringify(_lookedPaths, null, 2)}`);

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
  //internal
  check(submissionIds, 'mustExists', 'array');
  check(_submissionIds, 'mustExists', 'array');

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
 * checkRunConfigs - Check configs object.
 * @param {object} configs
 */
function checkRunConfigs(configs) {
  //internal
  check(configs, 'ifExists', 'object');
  
  //check
  if(!configs) return {};

  let errors = [];
  let valid_keys = ['filters', 'token', 'apiServerUrl', 'mediaServerUrl', 'outputDir', 'maxRequestRetries',
                    'maxDownloadRetries', 'requestTimeout', 'connectionTimeout', 'downloadTimeout', 'deleteImages'];
  let valid_filters_keys = ['assetId', 'submissionIdsCsv', 'submissionIds'];

  //check: keys
  let o_keys = Object.keys(configs);
  for(let i=0; i<o_keys.length; i++) {
    if(!valid_keys.includes(o_keys[i])) errors.push(`not valid key in configs: '${o_keys[i]}'`);
  }

  //check: types
  try {
    check(configs.token, 'ifExists', 'string');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.apiServerUrl, 'ifExists', 'string');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.mediaServerUrl, 'ifExists', 'string');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.outputDir, 'ifExists', 'string');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.maxRequestRetries, 'ifDefined', 'number');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.maxDownloadRetries, 'ifDefined', 'number');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.requestTimeout, 'ifDefined', 'number');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.connectionTimeout, 'ifDefined', 'number');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.downloadTimeout, 'ifDefined', 'number');
  } catch(error) {errors.push(error.message)}
  try {
    check(configs.deleteImages, 'ifDefined', 'boolean');
  } catch(error) {errors.push(error.message)}

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
