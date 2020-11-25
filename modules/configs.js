/**
 * configs.js
 * 
 * Helper module that provides the following main functions:
 *   - init()           getConfigs() & setupOutputDir()
 *   - getConfigs()     builds object with configs.
 *   - setupOutputDir() builds output dirs tree.
 */
import globals from '../configs/globals.js';
import { check, confirm, isOfType } from './checks.js';
import * as Utils from './utils.js';
import fs from 'fs-extra';
import { resolve, join, parse } from 'path';
import csvParseSync from 'csv-parse/lib/sync.js';
import colors from 'colors/safe.js';
import { run } from 'node-jq';

/**
 * init  build configurations object and setup the
 * output dirs tree.
 * @param {object} program 
 * @param {string} mainDir
 * @returns configuration object 
 */
export function init(program, mainDir) {
  let configs = null;
  try {
    /**
     * Set configurations
     */
    configs = getConfigs(program, mainDir);
    //internal
    check(configs, 'mustExists', 'object');
    /**
     * Set output dirs tree
     */
    setupOutputDir(configs);
    /**
     * Write configs
     */
    let log_path = join(configs.currentRunPath);
    let log_file = join(log_path,`run-configs.json`);
    Utils.makeDirPath(log_path);
    Utils.writeFile(log_file, JSON.stringify(configs, null, 2), {async:true});
    
  } catch(error) {
    console.log('\n'+colors.red(error.name)+':', error.message);
    console.log(colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1)));
    process.exit(1);
  }
  return configs;
}

/**
 * getConfigs   builds configurations object.
 * 
 * The configurations object has the following attributes:
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
     *  - mainDir/ 
     */
    let _lookedPaths = [];
    let _configFile_path = null;
    let _first_path = resolve(program.configFile);

    if(Utils.fileExists(_first_path)) _configFile_path = _first_path;
    else {
      _lookedPaths.push(_first_path);

      let _dir = parse(program.configFile).dir;
      if(_dir === '') {
        let _second_path = resolve(join(mainDir, "run-configs", program.configFile));
        let _third_path = resolve(join(mainDir, program.configFile));
        if(Utils.fileExists(_second_path)) _configFile_path = _second_path;
        else {
          _lookedPaths.push(_second_path);
          if(Utils.fileExists(_third_path)) _configFile_path = _third_path;
          else _lookedPaths.push(_third_path);
        }
      }
    }
    //check
    if(!_configFile_path) throw new Error(`config file not found: ${program.configFile} - in: \n${JSON.stringify(_lookedPaths, null, 2)}`);

    runConfigs = Utils.parseJSONFile(_configFile_path);
    checkRunConfigs(runConfigs, mainDir);

    //for each filter
    for(let i=0; i<runConfigs.filters.length; i++) {
      let filter = runConfigs.filters[i];
      //set submission ids
      filter._submissionIds = getSubmissionIds(filter, mainDir);
      //set metadata fields
      if(filter.metadata) {
        filter._mdCsvPath = resolveInputFile(filter.metadata.mdCsv, mainDir);
        filter._mdCsvSeparator = filter.metadata.mdCsvSeparator ? filter.metadata.mdCsvSeparator : ',';
        filter._mdCsvImageNameColumnIndex = resolveCsvColumnIndex(filter._mdCsvPath, filter.metadata.mdCsvImageNameColumn, filter._mdCsvSeparator);
        filter._mdCsvImageNameColumn = filter.metadata.mdCsvImageNameColumn;
      }
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

  /**
   * Check: 
   * - either filters or token should be specified.
   * - only one of filters or token should be specified.
   */
  if(!configs.filters.length && !configs.token) throw new Error(`either 'filters' or 'token' should be properly configured`);
  if(configs.filters.length && configs.token) throw new Error(`only one of 'filters' or 'token' should be configured`);

  //set mode
  if(configs.filters.length) configs.mode = 'filters';
  else configs.mode = 'token';

  return configs;
}

/**
 * setupOutputDir  Set up output dirs tree and
 * adds paths to @configs object.
 * 
 * output/
 *      .attachments_map/
 *      images/
 *      runs/
 *          run_<timestamp>/
 *                    logs/
 *                    steps/
 *                    images_deleted/
 * 
 * keys added to configs:
 *  outputPath
 *  attachmentsMap
 *  imagesPath
 *  runsPath
 *  currentRunPath
 *  logsPath
 *  runLogPath
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

    if(Utils.dirExists(_first_path)) _output_dir = _first_path;
    else {
      _lookedPaths.push(_first_path);
      let _dir = parse(configs.outputDir).dir;
      if(_dir === '') {
        let _second_path = resolve(join(configs.mainDir, configs.outputDir));
        if(Utils.dirExists(_second_path)) _output_dir = _second_path;
        else if(!_lookedPaths.includes(_second_path)) _lookedPaths.push(_second_path);
      }
    }

    //check
    if(!_output_dir) throw new Error(`output dir not found: ${configs.outputDir} - in: \n${JSON.stringify(_lookedPaths, null, 2)}`);
    else configs.outputPath = _output_dir;
  } else { //case: outputDir not specified
    /**
     * Check if default dir exists, and if not, create it.
     */
    let _output_dir = resolve(join(configs.mainDir, 'output'));
    if(Utils.dirExists(_output_dir)) configs.outputPath = _output_dir;
    else configs.outputPath = Utils.makeDirPath(_output_dir);
  }
  /**
   * Set up runs dirs tree
   * 
   * output/
   *      .attachments_map/
   *      images/
   *      runs/
   *          run_<timestamp>/
   *                    logs/
   *                    steps/
   *                    images_deleted/
   * 
   *  
   */
  configs.attachmentsMap = resolve(join(configs.outputPath, ".attachments_map"));
  Utils.makeDirPath(configs.attachmentsMap);

  configs.imagesPath = resolve(join(configs.outputPath, "images"));
  Utils.makeDirPath(configs.imagesPath);

  configs.runsPath = resolve(join(configs.outputPath, "runs"));
  Utils.makeDirPath(configs.runsPath);

  //get current run dir name
  let d = './run_'+Utils.getCurrentTimestamp();
  let _current_run_path = resolve(join(configs.runsPath, d));
  let max_tries = 100;
  let tries = 1;
  //avoid repeated dir name
  while(Utils.dirExists(_current_run_path)&&(tries<=max_tries)) {
    d = './run_'+Utils.getCurrentTimestamp()+'-'+String(tries);
    t_current_run_path = resolve(d);
    tries++;
  }
  //check
  if(Utils.dirExists(_current_run_path)) throw new Error('run path could not be created');

  configs.currentRunPath = _current_run_path;
  Utils.makeDirPath(configs.currentRunPath);

  configs.logsPath = resolve(join(configs.currentRunPath, "logs"));
  Utils.makeDirPath(configs.logsPath);
  configs.runLogPath = resolve(join(configs.logsPath, "run.log"));

  configs.stepsPath = resolve(join(configs.currentRunPath, "steps"));
  Utils.makeDirPath(configs.stepsPath);

  configs.imagesDeletedPath = resolve(join(configs.currentRunPath, "images_deleted"));
  Utils.makeDirPath(configs.imagesDeletedPath);

  return configs;
}

/**
 * getSubmissionIds - get total set of submission ids in @filter.
 * @param {object} filter object with filter configurations. 
 * @param {string} mainDir dirname of the main js script.
 */
function getSubmissionIds(filter, mainDir) {
  //internal
  check(filter, 'mustExists', 'object');
  check(filter.submissionIds, 'ifExists', 'array');
  check(filter.submissionIdsCsv, 'ifExists', 'string');
  check(mainDir, 'mustExists', 'string');

  let _submissionIds = [];

  //add ids from @submissionIds
  if(filter.submissionIds) addSubmissionIds(filter.submissionIds, _submissionIds);

  //add ids from @submissionIdsCsv
  if(filter.submissionIdsCsv) {
    let sids = getSubmissionIdsFromCsv(filter, mainDir);
    addSubmissionIds(sids, _submissionIds);
  }

  return _submissionIds;
}

/**
 * resolveInputFile  resolve path of given @file if exists. Throw
 * error if not exists.
 * @param {object} file input file to resolve.
 * @param {string} mainDir dirname of the main js script.
 * @return {string} resolved file path.
 */
function resolveInputFile(file, mainDir) {
  //internal
  check(file, 'mustExists', 'string');
  check(mainDir, 'mustExists', 'string');

  /**
   * lookup for file in:
   *  - file
   *  - mainDir/input/
   *  - mainDir/ 
   */
  let _lookedPaths = [];
  let _first_path = resolve(file);

  if(Utils.fileExists(_first_path)) return _first_path;
  else {
    _lookedPaths.push(_first_path);

    let _dir = parse(file).dir;
    if(_dir === '') {
      let _second_path = resolve(join(mainDir, "input", file));
      let _third_path = resolve(join(mainDir, file));
      if(Utils.fileExists(_second_path)) return _second_path;
      else {
        if(!_lookedPaths.includes(_second_path)) _lookedPaths.push(_second_path);
        if(Utils.fileExists(_third_path)) return _third_path;
        else { //not found
          if(!_lookedPaths.includes(_third_path)) _lookedPaths.push(_third_path);
          throw new Error(`input file not found: ${file} - in: \n${JSON.stringify(_lookedPaths, null, 2)}`);
        }
      }
    }
  }
}

/**
 * resolveCsvColumnIndex  resolve column name in the given @csvFile if exists. Throw
 * error if column does not exists.
 * @param {object} csvFile csv file.
 * @param {string} column column name to resolve.
 * @param {string} delimiter column delimiter.
 * @return {string} resolved column name.
 */
function resolveCsvColumnIndex(csvFile, column, delimiter) {
  //internal
  check(csvFile, 'mustExists', 'string');
  check(column, 'mustExists', 'string');
  check(delimiter, 'mustExists', 'string');

  let _file = csvFile;
  let data = null;
  let records = null;

  //read
  try {
    data = fs.readFileSync(_file, 'utf8');
  } catch (e) {
    throw new Error(`file read operation failed: ${_file} - error: ` + e.message);
  }

  //parse
  try {
    records = csvParseSync(data, {
      columns: false,
      skip_empty_lines: true,
      delimiter: delimiter
    })
    //internal
    check(records, 'mustExists', 'array');
    //check
    if(records.length === 0) throw new Error(`csv parsed result is empty - csv file: ${_file}`);
  } catch (e) {
    throw new Error(`CSV parse operation failed - csv file: ${_file} - error: ` + e.message);
  }
  //check
  if(records.length === 1) throw new Error(`csv parsed results has not data - csv file: ${_file}`);

  //get headers
  let headers = records[0];
  //internal
  check(headers, 'mustExists', 'array');

  //check _id column
  let columnCount = 0;
  let idColumnIndex = -1;
  for(let i=0; i<headers.length; i++) {
    let h = headers[i];
    if(h.trim() === column) { columnCount++; idColumnIndex = i };
  }
  //check
  if(columnCount === 0) throw new Error(`column '${column}' not found in csv @headers - csv file: ${_file}`);
  if(columnCount > 1) throw new Error(`column '${column}' found more than once in csv @headers - csv file: ${_file}`);

  return idColumnIndex;
}

/**
 * getSubmissionIdsFromCsv  gets ids from csv file. Throw
 * error if some id isn't valid.
 * @param {object} filter object with filter configurations.
 * @param {string} mainDir dirname of the main js script.
 */
function getSubmissionIdsFromCsv(filter, mainDir) {
  //internal
  check(filter, 'mustExists', 'object');
  check(filter.submissionIdsCsv, 'mustExists', 'string');
  check(filter.submissionIdsCsvIdColumn, 'ifExists', 'string');
  check(filter.submissionIdsCsvSeparator, 'ifExists', 'string');
  check(mainDir, 'mustExists', 'string');
  
  let data = null;
  let records = null;
  let _idColumn = (filter.submissionIdsCsvIdColumn) ? filter.submissionIdsCsvIdColumn : 'id';
  let _delimiter = (filter.submissionIdsCsvSeparator) ? filter.submissionIdsCsvSeparator : ',';
  let ids = [];
  let errors = [];

  /**
   * lookup for submissionIdsCsv file in:
   *  - submissionIdsCsv
   *  - mainDir/input/
   *  - mainDir/ 
   */
  let _file = resolveInputFile(filter.submissionIdsCsv, mainDir);

  //read
  try {
    data = fs.readFileSync(_file, 'utf8');
  } catch (e) {
    throw new Error(`file read operation failed: ${_file} - error: ` + e.message);
  }

  //parse
  try {
    records = csvParseSync(data, {
      columns: false,
      skip_empty_lines: true,
      delimiter: _delimiter
    })
    //internal
    check(records, 'mustExists', 'array');
    //check
    if(records.length === 0) throw new Error(`csv parsed result is empty - csv file: ${_file}`);
  } catch (e) {
    throw new Error(`CSV parse operation failed: ` + e.message);
  }
  //check
  if(records.length === 1) throw new Error('csv parsed results has not data');

  //get headers
  let headers = records[0];
  //internal
  check(headers, 'mustExists', 'array');

  //check _id column
  let idColumnCount = 0;
  let idColumnIndex = -1;
  for(let i=0; i<headers.length; i++) {
    let h = headers[i];
    //for(let l=0; l<h.length; l++) console.log("[",l,"]:", Number(h[l]))
    if(h.trim() === _idColumn) { idColumnCount++; idColumnIndex = i };
  }
  //check
  if(idColumnCount === 0) throw new Error(`id column '${_idColumn}' not found in csv @headers`);
  if(idColumnCount > 1) throw new Error(`id column '${_idColumn}' found more than once in csv @headers`);

  //get ids
  for(let i=1; i<records.length; i++) {
    let r = records[i];
    //internal
    check(r, 'mustExists', 'array');
    //check
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

/**
 * addSubmissionIds  returns a set of ids resulting from the union of
 * the given array sets.
 * @param {array} submissionIds input array with ids to add to output array. 
 * @param {array} _submissionIds ouput array where ids from input array will
 * be added into.
 */
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
 * checkRunConfigs - Check configs object. Throw errors if
 * there are not valid configs.
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
  let valid_filters_keys = ['assetId', 'submissionIdsCsv', 'submissionIds', 'submissionIdsCsvIdColumn',
                            'submissionIdsCsvSeparator', 'metadata'];
  let valid_metadata_keys = ['mdCsv', 'mdCsvImageNameColumn', 'mdCsvSeparator'];

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
      let assetIds = [];
      for(let i=0; i<configs.filters.length; i++) {
        let filter = configs.filters[i];

        //check
        if(!filter || typeof filter !== 'object') {
          errors.push(`expected object - in @filters entry ${i}`);
        } else {

          //get keys
          let o_keys = Object.keys(filter);
          //check: no keys
          if(!o_keys.length) errors.push(`filter entry has not keys configured: - in @filters entry ${i}`);
          //check: valid keys
          for(let j=0; j<o_keys.length; j++) {
            if(!valid_filters_keys.includes(o_keys[j])) errors.push(`not valid key in configs.filters: '${o_keys[j]}'`);
          }

          //check: assetId
          if(filter.assetId === undefined) errors.push(`mandatory key 'assetId' is not defined - in @filters entry ${i}`);
          else if(filter.assetId === null) errors.push(`string expected in key 'assetId' but is null - in @filters entry ${i}`);
          else if(filter.assetId === '') errors.push(`non-empty string expected in key 'assetId' but is empty - in @filters entry ${i}`);
          else if(typeof filter.assetId !== 'string') errors.push(`string expected in key 'assetId' but is not a string - in @filters entry ${i}`);
          else if(assetIds.includes(filter.assetId)) errors.push(`repeated 'assetId' found, each assetId should appears only once in filters - in @filters entry ${i}`);
          else assetIds.push(filter.assetId);

          //check: submissionIds
          if(filter.submissionIds !== undefined) {
            if(filter.submissionIds === null) errors.push(`array expected in key 'submissionIds' but is null - in @filters entry ${i}`);
            else if(!Array.isArray(filter.submissionIds)) errors.push(`array expected in key 'submissionIds' - in @filters entry ${i}`);
          }

          //check: submissionIdsCsv
          if(filter.submissionIdsCsv !== undefined) {
            if(filter.submissionIdsCsv === null) errors.push(`string expected in key 'submissionIdsCsv' but is null - in @filters entry ${i}`);
            else if(filter.submissionIdsCsv === '') errors.push(`string expected in key 'submissionIdsCsv' but is empty - in @filters entry ${i}`);
            else if(typeof filter.submissionIdsCsv !== 'string') errors.push(`string expected in key 'submissionIdsCsv' but is not a string - in @filters entry ${i}`);
          }

          //check: submissionIdsCsvIdColumn
          if(filter.submissionIdsCsvIdColumn !== undefined) {
            if(filter.submissionIdsCsvIdColumn === null) errors.push(`string expected in key 'submissionIdsCsvIdColumn' but is null - in @filters entry ${i}`);
            else if(filter.submissionIdsCsvIdColumn === '') errors.push(`string expected in key 'submissionIdsCsvIdColumn' but is empty - in @filters entry ${i}`);
            else if(typeof filter.submissionIdsCsvIdColumn !== 'string') errors.push(`string expected in key 'submissionIdsCsvIdColumn' but is not a string - in @filters entry ${i}`);

            if(!filter.submissionIdsCsv === undefined) errors.push(`key 'submissionIdsCsvIdColumn' is defined but 'submissionIdsCsv' isn't - in @filters entry ${i}`);
          }

          //check: submissionIdsCsvSeparator
          if(filter.submissionIdsCsvSeparator !== undefined) {
            if(filter.submissionIdsCsvSeparator === null) errors.push(`string expected in key 'submissionIdsCsvSeparator' but is null - in @filters entry ${i}`);
            else if(filter.submissionIdsCsvSeparator === '') errors.push(`string expected in key 'submissionIdsCsvSeparator' but is empty - in @filters entry ${i}`);
            else if(typeof filter.submissionIdsCsvSeparator !== 'string') errors.push(`string expected in key 'submissionIdsCsvSeparator' but is not a string - in @filters entry ${i}`);

            if(!filter.submissionIdsCsv === undefined) errors.push(`key 'submissionIdsCsvSeparator' is defined but 'submissionIdsCsv' isn't - in @filters entry ${i}`);
          }

          //check: metadata
          if(filter.metadata !== undefined) {
            //check
            if(!filter.metadata || typeof filter.metadata !== 'object') {
              errors.push(`expected object in @filters.metadata`);
            } else {
              //get keys
              let o_keys = Object.keys(filter.metadata);
              //check: no keys
              if(!o_keys.length) errors.push(`filter.metadata has not keys configured: - in @filters entry ${i}`);
              //check: valid keys
              for(let j=0; j<o_keys.length; j++) {
                if(!valid_metadata_keys.includes(o_keys[j])) errors.push(`not valid key in configs.filters.metadata: '${o_keys[j]}' - in @filters entry ${i}`);
              }

              //check: mdCsv (required)
              if(filter.metadata.mdCsv === undefined) errors.push(`string expected in key 'metadata.mdCsv' but is undefined - in @filters entry ${i}`);
              else if(filter.metadata.mdCsv === null) errors.push(`string expected in key 'metadata.mdCsv' but is null - in @filters entry ${i}`);
              else if(filter.metadata.mdCsv === '') errors.push(`string expected in key 'metadata.mdCsv' but is empty - in @filters entry ${i}`);
              else if(typeof filter.metadata.mdCsv !== 'string') errors.push(`string expected in key 'submissionIdsCsv' but is not a string - in @filters entry ${i}`);

              //check: mdCsvImageNameColumn (required)
              if(filter.metadata.mdCsvImageNameColumn === undefined) errors.push(`string expected in key 'metadata.mdCsvImageNameColumn' but is undefined - in @filters entry ${i}`);
              else if(filter.metadata.mdCsvImageNameColumn === null) errors.push(`string expected in key 'metadata.mdCsvImageNameColumn' but is null - in @filters entry ${i}`);
              else if(filter.metadata.mdCsvImageNameColumn === '') errors.push(`string expected in key 'metadata.mdCsvImageNameColumn' but is empty - in @filters entry ${i}`);
              else if(typeof filter.metadata.mdCsvImageNameColumn !== 'string') errors.push(`string expected in key 'metadata.mdCsvImageNameColumn' but is not a string - in @filters entry ${i}`);

              //check: mdCsvSeparator
              if(filter.metadata.mdCsvSeparator !== undefined) {
                if(filter.metadata.mdCsvSeparator === null) errors.push(`string expected in key 'metadata.mdCsvSeparator' but is null - in @filters entry ${i}`);
                else if(filter.metadata.mdCsvSeparator === '') errors.push(`string expected in key 'metadata.mdCsvSeparator' but is empty - in @filters entry ${i}`);
                else if(typeof filter.metadata.mdCsvSeparator !== 'string') errors.push(`string expected in key 'metadata.mdCsvSeparator' but is not a string - in @filters entry ${i}`);
              }
            }
          }

        }//end: for each filter entry
      }
    }
  }//end: check: filters

  if(errors.length > 0) throw new Error(`configs file has errors: \n${JSON.stringify(errors, null, 2)}\n`);
  else return true;
}
