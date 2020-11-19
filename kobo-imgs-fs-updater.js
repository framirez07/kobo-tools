import { getAssets, getAssetInfo, getSubmissions } from './modules/kobo-api.js';
import { saveImage } from './modules/kobo-imgs-fs.js';
import * as Utils from './modules/utils.js';
import * as Configs from './modules/configs.js'
import { check, confirm, isOfType } from './modules/checks.js';
import { ImageCleaner } from './modules/image-cleaner.js';
import program from 'commander';
import colors from 'colors/safe.js';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const assetIdColor = colors.cyan.dim.bold;
const indexIndicatorColor = colors.cyan.bold;
const separatorColor = colors.grey.bold;
const titleColor = colors.brightCyan;

/**
 * Comand line options
 */
program
  .description('KoBo image file-system updater.')
  .option('-f, --config-file <FILE>', 'JSON file with run configs.')
  .option('-s, --api-server-url <URL>', 'URL of the KoBo API server.')
  .option('-m, --media-server-url <URL>', 'URL of the KoBo media server.')
  .option('-o, --output-dir <DIR>', 'Directory where the run results will be stored')
  .option('-t, --token <TOKEN>', 'KoBo authentication token.')
  .option('-d, --delete-images', 'Remove images instead of the default behavior of moving them to the images_deleted dir.')
  .option('--max-request-retries <MAX_REQUEST_RETRIES>', 'Max request retries before cancel the process.')
  .option('--max-download-retries <MAX_DOWNLOAD_RETRIES>', 'Max download retries before cancel the process.')
  .option('--request-timeout <REQUEST_TIMEOUT>', 'Request timeout before trying again.')
  .option('--connection-timeout <CONETION_TIMEOUT>', 'Connection timeout before trying again.')
  .option('--download-timeout <DOWNLOAD_TIMEOUT>', 'Download timeout before trying again.');
program.parse(process.argv);

/**
 * init & start
 */
let _configs = null;
try {
  /**
   * Init configs and setup the output dirs tree
   */
  _configs = Configs.init(program, __dirname);
  //internal
  check(_configs, 'mustExists', 'object');
  
  /**
   * Start image update process
   */
  start();
} catch(error) {
  console.log('\n'+colors.red(error.name)+':', error.message);
  console.log(colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1)));
  process.exit(1);
}

/**
 * start  run process steps.
 */
async function start() {
  let results = {};

  /**
   * Check mode:
   *   - if mode 'filters': getAssetsList does not apply.
   *   - if mode 'token': getAssetsList applies.
   */
  let steps = [];
  if(_configs.mode === 'filters') steps = [getImageFields, getAssetsSubmissions, buildActionMap, updateImages];
  else if(_configs.mode === 'token') steps = [getAssetsList, getImageFields, getAssetsSubmissions, buildActionMap, updateImages];

  //msg
  Utils.log(_configs.runLogPath, `Starting to run [${steps.length}] steps (mode: ${_configs.mode})\n`, {withTimestamp:true});

  //run steps
  for(let i=0; i<steps.length; i++) { await run( steps[i], i+1, steps.length, results ); }
  
  //msg
  Utils.log(_configs.runLogPath, `Process completed.`, {withTimestamp:true});
  Utils.log(_configs.runLogPath, `------------------\n`, {withTimestamp:true});
  process.exit(0);
}

async function run( step, stepId, totalSteps, results ) {
  //internal
  check(step, 'mustExists', 'function');
  check(stepId, 'defined', 'number');
  check(totalSteps, 'mustExists', 'number');
  check(results, 'mustExists', 'object');

  //log
  Utils.log(_configs.runLogPath, `step ${titleColor(stepId)} of ${titleColor(totalSteps)} - `, {noNewLine:true});

  let _step = `step${stepId}`;
  let _prevStep = `step${stepId-1}`;
  try {
    results[_step] = await step(stepId, results[_prevStep]);
    //internal
    check(results[_step], 'mustExists', 'array');

    //check
    if(results[_step].length === 0) {
      //log
      Utils.log(_configs.runLogPath, `process finished at ${stepId} of ${totalSteps}`, {withTimestamp:true});
      Utils.log(_configs.runLogPath, colors.yellow('done'));
      Utils.log(_configs.runLogPath, `-----------------\n`);
      process.exit(1);
    }
  } catch(error) {
    //log
    Utils.log(_configs.runLogPath, `step ${stepId} ${colors.red('fails')}`);
    Utils.log(_configs.runLogPath, `${colors.red(error.name)}: ${error.message}`);
    Utils.log(_configs.runLogPath, `${colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1))}`);
    Utils.log(_configs.runLogPath, colors.red('done'));
    Utils.log(_configs.runLogPath, `-----------------\n`);
    process.exit(1);
  }
}

/**
 * getAssetsList  get assets list.
 * @param {number} stepId step's id. 
 */
async function getAssetsList(stepId) {
  //internal
  check(stepId, 'defined', 'number');

  //log
  Utils.log(_configs.runLogPath, colors.brightCyan('get assets'), {noTimestamp:true, noPadding:true});
 
  //step log path
  let step_log_path = join(_configs.stepsPath, `${stepId}_get_assets`);
  Utils.makeDirPath(step_log_path);

  /**
   * Set configurable keys and values
   */
  //config.filters
  let _filters = _configs.filters;  
  //asset uid values
  let c_asset_values_uid = _filters.map((o) => o.assetId);

  /**
   * Set required keys
   */
  //asset keys
  let r_asset_keys = ["uid", "name", "deployment__submission_count"];

  /**
   * Configure filters 
   */
  let jq = [];
  /**
   * Filter 1: 
   * 
   * select entries with values in: 
   *    c_asset_values_uid
   */
  if(c_asset_values_uid.length > 0) {
    let select_asset_values_uid = Utils.toJqSelectBody("uid", c_asset_values_uid, "==", "or");
    let f1 = `.[]|[select(${select_asset_values_uid})]`;
    jq.push(f1);
  }
  /**
   * Filter 2: 
   * 
   * include keys in: 
   *    r_asset_keys
   */
  if(r_asset_keys.length > 0) {
    let keys =  r_asset_keys.map(item => `${item}: .${item}`).join(',');
    let f2 = `.[]|[{${keys}}]`;
    jq.push(f2);
  }
  /**
   * Get assets
   */
  let options = {..._configs, step_log_path, resFilters: {jq: jq}};
  //get
  let result = await getAssets(options);
  //internal
  check(result, 'mustExists', 'object');
  check(result.results, 'mustExists', 'array');
  check(result.report, 'mustExists', 'array');
  check(result.status, 'defined', 'boolean');

  //report
  Utils.log(_configs.runLogPath, result.status ? colors.brightCyan('ok') : colors.red('fail'));
  Utils.printReportCounters(result.report, _configs.runLogPath);
  Utils.log(_configs.runLogPath, separatorColor(`-----------------\n`));

  //write result
  let step_log_file = join(step_log_path,`${stepId}-result.json`);
  Utils.writeFile(step_log_file, JSON.stringify(result, null, 2), {async:false});

  //overall status
  let status = result.status;

  if(status) return result.results;
  else throw new Error('step completed with failed operations');
}

/**
 * getImageFields  get assets image-fields.
 * @param {number} stepId step's id.
 * @param {array} input input array. 
 */
async function getImageFields(stepId, input) {
  //internal
  check(stepId, 'defined', 'number');
  check(input, 'ifExists', 'array');

  //log
  Utils.log(_configs.runLogPath, colors.brightCyan('get image fields'), {noTimestamp:true, noPadding:true});
  
  //step log path
  let step_log_path = join(_configs.stepsPath, `${stepId}_get_image_fields`);
  Utils.makeDirPath(step_log_path);    
  
  /**
   * Check mode & set input.
   * 
   * The required format on input is:
   * "results": [
   *    {
   *      "uid": "asset id"
   *    }
   *  ]
   */
  //input
  let assets = [];
  if(_configs.mode === 'filters') assets = _configs.filters.map(e => ({uid: e.assetId}));
  else if(_configs.mode === 'token') assets = input;

  /**
   * Set required keys
   */
  let r_asset_keys = ["uid", "name", "deployment__submission_count"];

  /**
   * Configure filters
   */
  let jq = [];
  /**
   * Filter 1: 
   * 
   * include keys in: 
   *    r_asset_keys
   * include new keys: 
   *    imgs
   */
  let keys =  r_asset_keys.map(item => `${item}: .${item}`).join(',');
  let key_imgs = 'imgs: [.content.survey[]|select(.type=="image")]'; 
  let f1 = `.[]|[{${keys}, ${key_imgs}}]`;
  jq.push(f1);
  /**
   * Get assets
   */
  let options = {..._configs, step_log_path, resFilters: {jq: jq}};
  //counters
  let assetsCount = assets.length;
  let assetsFetched = 0;
  let assetsFiltered = 0;
  let totalResults = 0;
  //overall status
  let status = true;
  //for each asset
  let results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];
    //internal
    check(asset, 'mustExists', 'object');
    check(asset.uid, 'mustExists', 'string');

    //check: 
    if(_configs.mode === 'token') {
      //internal
      check(asset.deployment__submission_count, 'defined', 'number');

      //check
      if(asset.deployment__submission_count === 0) {
        //log
        Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: has no submissions - ${colors.yellow('(skipped)')}`);
        //count
        assetsFiltered++;
        continue;
      }
    }

    //get
    let result = await getAssetInfo(asset.uid, options);
    //internal
    check(result, 'mustExists', 'object');
    check(result.results, 'mustExists', 'array');
    check(result.report, 'mustExists', 'array');
    check(result.status, 'defined', 'boolean');
   
    //prepare result (includes imgs key)
    result.results = result.results.map(r => ({...asset, ...r}));
    //add result
    results = [...results, ...result.results];
    //count
    assetsFetched++;

    //report
    Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: `, {noNewLine:true});  
    if(result.status) {
      let imgCounters = result.results.map(r => ({counters: {totalImgsFields: r.imgs.length}}));
      Utils.printReportCounters(imgCounters, _configs.runLogPath, {noTimestamp:true}); 
    } else {
      Utils.log(_configs.runLogPath, `${colors.red('fail')}`, {noTimestamp:true});
    }

    //update overall status
    status = status && result.status;
  }//end: for each asset

  //report
  totalResults = results.length;
  Utils.log(_configs.runLogPath, `${status ? colors.brightCyan('ok') : colors.red('fail')}`);
  let counters = {assetsCount, assetsFetched, assetsFiltered, totalResults};
  Utils.printReportCounters([{counters}], _configs.runLogPath);
  Utils.log(_configs.runLogPath, separatorColor(`-----------------\n`));

  //write result
  let step_log_file = join(step_log_path,`${stepId}-result.json`);
  Utils.writeFile(step_log_file, JSON.stringify(results, null, 2), {async:false});
  
  if(status) return results;
  else throw new Error('step completed with failed operations');
}

/**
 * getAssetsSubmissions  get assets submissions.
 * @param {number} stepId step's id.
 * @param {array} input input array.
 */
async function getAssetsSubmissions(stepId, input) {
  //internal
  check(stepId, 'defined', 'number');
  check(input, 'mustExists', 'array');

  //log
  Utils.log(_configs.runLogPath, colors.brightCyan('get submissions'), {noTimestamp:true, noPadding:true});
  
  //step log path
  let step_log_path = join(_configs.stepsPath, `${stepId}_get_submissions`);
  Utils.makeDirPath(step_log_path);
  
  //input
  let assets = input;

  /**
   * Set filters
   */
  let _filters = _configs.filters;  

  //counters
  let assetsCount = assets.length;
  let assetsFetched = 0;
  let assetsFiltered = 0;
  let totalResults = 0;
  //overall status
  let status = true;
  //for each asset
  let results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];
    //internal
    check(asset, 'mustExists', 'object');
    check(asset.uid, 'mustExists', 'string');
    check(asset.deployment__submission_count, 'defined', 'number');
    check(asset.imgs, 'mustExists', 'array');

    //check: no submissions
    if(asset.deployment__submission_count === 0) {
      //log
      Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: has no submissions - ${colors.yellow('(skipped)')}`);
      //count
      assetsFiltered++;
      continue;
    }

    //check: no image-fields
    if(asset.imgs.length === 0) {
      //log
      Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: has no image fields - ${colors.yellow('(skipped)')}`);
      //count
      assetsFiltered++;
      continue;
    }

    /**
     * Set configurable keys and values
     */
    //submission keys
    let c_submission_keys = [];
    //submission _id values
    let filter = _filters.find(e => e.assetId === asset.uid);
    let c_submission_values__id = filter._submissionIds;

    /**
     * Set required keys
     */
    //submission keys
    let r_submission_keys = ["_id", "_attachments", "_uuid", "formhub/uuid"];
    //submission image-fields keys
    let r_submission_keys_images = asset.imgs.map(e => e['$autoname']);

    /**
     * Configure filters 
     */
    let jq = [];

    /**
     * Filter 1: 
     * 
     * select entries with values in: 
     *    c_submission_values__id
     */
    if(c_submission_values__id.length > 0) {
      let select_submission_values__id = Utils.toJqSelectBody("_id", c_submission_values__id, "==", "or");
      let f1 = `[.[]|select(${select_submission_values__id})]`;
      jq.push(f1);
    }

    /**
     * Filter 2: 
     * 
     * select keys in: 
     *    c_submission_keys         (exact match)
     *    r_submission_keys         (exact match)
     *    r_submission_keys_images  (exact or partial match)
     * 
     * add keys:
     *    @images_map  :  { unique_autoname_fieldA : [
     *                          { submission_fieldA: value }  <-- should be only one                  
     *                        ],
     *                        ... more unique_autoname_fieldN
     *                      }
     */
    let e_submission_keys = [...c_submission_keys, ...r_submission_keys];
    let ep_submission_keys = [...r_submission_keys_images];
    let e_match_submission_keys = Utils.escapeRegExp(e_submission_keys).map(e => `^${e}$`).join('|');
    let ep_match_submission_keys = Utils.escapeRegExp(ep_submission_keys).map(e => `^${e}$|/${e}$`).join('|');
    let match_submisison_keys = e_match_submission_keys+'|'+ep_match_submission_keys;
    let images_map_entries = r_submission_keys_images.map(e => `${e}: with_entries( select(.key|match("^${e}$|/${e}$")) )|to_entries|[.[]|{(.key): .value}]`).join(',');
    //filter
    let f2 = `[.[]|with_entries( select(.key|match("${match_submisison_keys}")) ) + {"@images_map": {${images_map_entries}}} ]`;
    jq.push(f2);    

    /**
     * KoBo API request
     */
    let options = {..._configs, step_log_path, resFilters: {jq: jq}};
    //get
    let result = await getSubmissions(asset.uid, options);
    //internal
    check(result, 'mustExists', 'object');
    check(result.results, 'mustExists', 'array');
    check(result.report, 'mustExists', 'array');
    check(result.status, 'defined', 'boolean');
   
    //prepare result (includes submissions key)
    let _result = {...asset, submissions: result.results};
    //add result
    results.push(_result);
    //count
    assetsFetched++;

    //report
    Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: `, {noNewLine:true});  
    if(result.status) {
      let subCounters = [{ counters: {totalSubmissions: result.results.length}}];
      Utils.printReportCounters(subCounters, _configs.runLogPath, {noTimestamp:true}); 
    } else {
      Utils.log(_configs.runLogPath, `${colors.red('fail')}`, {noTimestamp:true});
    }

    //update overall status
    status = status && result.status;
  }//end: for each asset

  //prepare report
  totalResults = results.length;
  let countersA = {assetsCount, assetsFetched, assetsFiltered, totalResults};
  //report
  Utils.log(_configs.runLogPath, `${status ? colors.brightCyan('ok') : colors.red('fail')}`);
  Utils.printReportCounters([{counters: countersA}], _configs.runLogPath);
  Utils.log(_configs.runLogPath, separatorColor(`-----------------\n`));

  //write result
  let step_log_file = join(step_log_path,`${stepId}-result.json`);
  Utils.writeFile(step_log_file, JSON.stringify(results, null, 2), {async:false});
  
  if(status) return results;
  else throw new Error('step completed with failed operations');
}

/**
 * buildActionMap()  build action map
 * @param {number} stepId step's id.
 * @param {array} input input array.
 */
async function buildActionMap(stepId, input) {
  //internal
  check(stepId, 'defined', 'number');
  check(input, 'mustExists', 'array');

  //log
  Utils.log(_configs.runLogPath, colors.brightCyan('build action map'), {noTimestamp:true, noPadding:true});
  
  //step log path
  let step_log_path = join(_configs.stepsPath, `${stepId}_build_action_map`);
  Utils.makeDirPath(step_log_path);
  
  //input
  let assets = input;

  //counters
  let totalKeeps = 0;
  let totalDeletes = 0;
  let totalNones = 0;
  let totalWarnings = 0;
  let totalActions = 0;
  let assetsCount = assets.length;
  let assetsProcessed = 0;
  let assetsFiltered = 0;
  let totalResults = 0;
  //overall status
  let status = true;
  //for each asset
  let results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];
    //internal
    check(asset, 'mustExists', 'object');
    check(asset.uid, 'mustExists', 'string');
    check(asset.imgs, 'mustExists', 'array');
    check(asset.submissions, 'mustExists', 'array');

    //check
    if(asset.submissions.length === 0) {
      //log
      Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: has no submissions - ${colors.yellow('(skipped)')}`);
      //count
      assetsFiltered++;
      continue;
    }
    if(asset.imgs.length === 0) {
      //log
      Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: has no images fields - ${colors.yellow('(skipped)')}`);
      //count
      assetsFiltered++;
      continue;
    }

    //counters
    let keeps = 0;
    let deletes = 0;
    let nones = 0;
    let _totalActions = 0;
    
    //for each asset's submission
    let map = [];
    let warnings = [];
    for(let s=0; s<asset.submissions.length; s++) {
      let subm = asset.submissions[s];
      //internal
      check(subm, 'mustExists', 'object');
      check(subm["_attachments"], 'mustExists', 'array');
      check(subm["@images_map"], 'mustExists', 'object');
      check(subm["_id"], 'defined', 'number');

      let _map = {};

      //add _id
      _map["_id"] = subm["_id"];

      //for each image field in asset.imgs
      for(let j=0; j<asset.imgs.length; j++) {
        let imgField = asset.imgs[j];
        //internal
        check(imgField["$autoname"], 'mustExists', 'string');

        /**
         * Get @images_map for the field:
         * [
         *  {
         *    'img_key_in_submissions_object: img_name
         *  }
         * ]
         */
        let imgField_map_a = subm["@images_map"][imgField["$autoname"]];
        //internal
        check(imgField_map_a, 'mustExists', 'array');

        //check
        if(imgField_map_a.length > 1) throw new Error(`expected one or zero entries in @@images_map element: ${imgField_map_a}`);

        let subm_mapped_key = undefined;
        let value = undefined;
        let warning = undefined;

        /**
         * Case: img field has map (i.e. img field has key & value in submission object)
         */
        if(imgField_map_a.length === 1 ) {
          let imgField_map_a_e = imgField_map_a[0];
          //internal
          check(imgField_map_a_e, 'mustExists', 'object');

          let imgField_map_a_e_entries = Object.entries(imgField_map_a_e);
          //check
          if(imgField_map_a_e_entries.length !== 1) throw new Error(`expected only one entry in @@images_map element: ${imgField_map_a_e_entries}`);
          
          let imgField_map_a_e_entries_e = imgField_map_a_e_entries[0];
          subm_mapped_key = imgField_map_a_e_entries_e[0];
          value = imgField_map_a_e_entries_e[1];
        }

        /**
         * Build action map
         * 
         *  - keep
         *    if @value exists, it means that there exists an attachment corresponding
         *    to an image called '@value', and so this image must be kept o downloaded
         *    if not exists already or if it is outdated (i.e. a newer image with same 
         *    name exists in attachments).
         * 
         *  - delete
         *    if @value does not exists, it means that there is not an attachment
         *    corresponding to an image called '@value', and so this image must be
         *    deleted if exits locally.
         * 
         *  - none
         *    if @value exists, but there isn't attachment for it, the process
         *    will report this case as a warning, and, if the image exists, the
         *    cleaning process will moved it to 'images_deleted' dir.
         */
        let attachment = null;
        let action = null;
        //set action
        if(value) {
          //find attachment
          attachment = Utils.findAttachment(value, subm["_attachments"], subm["_id"]);

          //check
          if(!attachment) {
            /**
             * case: NONE
             */
            //inconsistent case  
            action = 'none';
            totalNones++;
            nones++;

            warning = `this field has an image name defined, but no attachment exist for it - record: ${subm["_id"]}, field: ${imgField["$autoname"]}, value: ${value}`;
            warnings.push(warning);
            totalWarnings++;
          } else {
            //internal
            check(attachment, 'mustExists', 'object');

            /**
             * case: KEEP
             */
            action = 'keep';
            totalKeeps++;
            keeps++;
          }
        } else { 
          /**
           * case: DELETE
           */
          action = 'delete';
          totalDeletes++;
          deletes++;
        }
        totalActions++;
        _totalActions++;

        //add image field action map
        _map[imgField["$autoname"]] = { value, attachment, action, subm_mapped_key, warning};
      }//end: //for each image field in asset.imgs

      map.push(_map);
    }//end: for each asset's submission

    //prepare result
    let mapCounters = {keeps, deletes, nones, totalActions: _totalActions, warnings: warnings.length}; 
    if(!warnings.length) delete mapCounters.warnings;
    //add result
    results.push({...asset, map, mapCounters});

    //count
    assetsProcessed++;

    //report
    Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)}: `, {noNewLine:true});  
    if(status) {
      Utils.printReportCounters([{ counters: mapCounters}], _configs.runLogPath, {noTimestamp:true});
      if(warnings.length > 0) Utils.printWarnings(warnings, _configs.runLogPath);
    } else {
      Utils.log(_configs.runLogPath, `${colors.red('fail')}`, {noTimestamp:true});
    }

  }//end: for each asset

  //prepare report
  totalResults = results.length;
  let countersA = {assetsCount, assetsProcessed, assetsFiltered, totalResults}
  let countersB = {totalKeeps, totalDeletes, totalNones, totalActions, totalWarnings};
  //remove empty warnings
  if(!totalWarnings) delete countersB.totalWarnings;
  //set status
  status = true; //the step hasn't reportable errors
  //report
  Utils.log(_configs.runLogPath, `${status ? colors.brightCyan('ok') : colors.red('fail')}`);
  Utils.printReportCounters([{counters: countersA}], _configs.runLogPath);
  Utils.printReportCounters([{counters: countersB}], _configs.runLogPath);
  Utils.log(_configs.runLogPath, separatorColor(`-----------------\n`));

  //write result
  let step_log_file = join(step_log_path,`${stepId}-result.json`);
  Utils.writeFile(step_log_file, JSON.stringify(results, null, 2), {async:false});

  if(status) return results;
  else throw new Error('step completed with failed operations');
}

/**
 * updateImages  update images
 * @param {number} stepId step's id.
 * @param {array} input input array.
 */
async function updateImages(stepId, input) {
  //internal
  check(stepId, 'defined', 'number');
  check(input, 'mustExists', 'array');

  //log
  Utils.log(_configs.runLogPath, colors.brightCyan('update images'), {noTimestamp:true, noPadding:true});

  //step log path
  let step_log_path = join(_configs.stepsPath, `${stepId}_update_images`);
  Utils.makeDirPath(step_log_path);

  //input
  let assets = input;

  //async task objects
  let imc = new ImageCleaner();

  //counters
  // --cleaner--
  let totalCleaned = 0;
  let totalCleanErrors = 0;
  let totalCleanActions = 0;
  let totalCleanActionsExecuted = 0;
  // --submissions--
  let totalDownloads = 0;
  let totalUpToDate = 0;
  let totalDeletes = 0;
  let totalNones = 0;
  let totalWarnings = 0;
  let totalErrors = 0;
  let totalActions = 0;
  // --assets--
  let assetsCount = assets.length;
  let assetsProcessed = 0;
  let assetsFiltered = 0;
  let totalResults = 0;

  //overall status
  let status = true;

  //for each asset
  let results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];
    //internal
    check(asset, 'mustExists', 'object');
    check(asset.uid, 'mustExists', 'string');
    check(asset.name, 'mustExists', 'string');
    check(asset.map, 'mustExists', 'array');
    check(asset.mapCounters, 'mustExists', 'object');

    //log: title: (asset level)
    Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)} ${colors.brightWhite.bold(asset.name)}`);  

    //check
    if(asset.map.length === 0) {
      //log
      Utils.log(_configs.runLogPath, `[${indexIndicatorColor(i+1)}/${indexIndicatorColor(assets.length)}]${assetIdColor(asset.uid)} ${colors.brightWhite.bold(asset.name)}: has no action-map - ${colors.yellow('(skipped)')}`);
      //count
      assetsFiltered++;
      continue;
    }

    //get asset.name
    let assetName = asset.name;

    /**
     * Make images paths & csv file
     */
    //images/{assetId}/{assetName}/
    let e_img_dir_path = Utils.toPath([_configs.imagesPath, asset.uid, assetName]);
    Utils.makeDirPath(e_img_dir_path);
    
    //images/{assetId}/{assetName}/data/
    let e_img_data_dir_path = Utils.toPath([e_img_dir_path, 'data']);
    Utils.makeDirPath(e_img_data_dir_path);
    
    //images/{assetId}/{assetName}/data/images_info.csv
    let e_images_info_file_path = Utils.toPath([e_img_data_dir_path, 'images_info.csv']);
    //write new file with headers
    Utils.writeFile(e_images_info_file_path, 'assetUid,assetName,recordId,name,size,sizeMB,type,dimensions,width,height,hash');

    //control
    let imageNamesToKeep = [];
    let imageNamesToKeepDuplicated = [];
    let imageNamesToDelete = [];
    let imageNamesToDeleteDuplicated = [];

    //counters
    let downloads = 0;
    let upToDate = 0;
    let deletes = 0;
    let nones = 0;
    let warnings = [];
    let errors = [];
    let actions = 0;

    let action_count = 0;
    let mapCounters = asset.mapCounters;

    /**
     * Asyncronous task: clean images
     */
    imc.map = asset.map;
    imc.path = Utils.toPath([_configs.imagesPath, asset.uid, asset.name]);
    imc.cleanedPath = Utils.toPath([_configs.imagesDeletedPath, asset.uid, asset.name]);
    imc.deleteImages = _configs.deleteImages;
    imc.runLogPath = _configs.runLogPath;
    imc.run();
  
    /**
     * Execute action map
     */
    //for each map item
    let images_update_run = [];
    let _ids = [];
    for(let m=0; m<asset.map.length; m++) {
      let emap = asset.map[m];
      //internal
      check(emap, 'mustExists', 'object');
      check(emap["_id"], 'defined', 'number');
      
      //log: title: (submission level)
      Utils.log(_configs.runLogPath, `[submission id:${colors.cyan.dim.bold(emap["_id"])}  ${m+1}/${asset.map.length}] ${colors.dim(assetIdColor(asset.uid))} ${colors.dim(asset.name)}`, {onNewLine:true});
 
      let _result = {};

      //add _id (submission id)
      _result["_id"] = emap["_id"];
      //save _id
      _ids.push(emap["_id"]);

      /**
       * Make attachments map base path
       */
      //attachments_map/{assetId}/{submissionId}/
      let e_attachment_map_dir_path = Utils.toPath([_configs.attachmentsMap, asset.uid, emap["_id"].toString()]);
      Utils.makeDirPath(e_attachment_map_dir_path);

      /**
       * Execute the action for each image field.
       * Each emap entry is of the following form:
       * {
       *    _id   //id of the submission
       *    imgField1:  {action...}
       *    imgField2:  {action...}
       *    ...
       * }
       * The _id key will be discarded, and the actions
       * of the image fields executed.
       */
      //get emap entries
      let _emap = {...emap}; delete _emap['_id'];
      let _emap_entries = Object.entries(_emap);

      //for each emap entry, excep _id.
      for(let j=0; j<_emap_entries.length; j++) {
        let entry = _emap_entries[j];
        let e_key = entry[0]; //img field autoname
        let e_value = entry[1]; //action object

        //internal
        check(e_value.action, 'mustExists', 'string');
        check(e_value.value, 'ifExists', 'string');
        check(e_value["attachment"], 'ifExists', 'object');
        if(e_value["attachment"]) {
          check(e_value["attachment"]["download_url"], 'mustExists', 'string');
          check(e_value["attachment"]["id"], 'defined', 'number');
          check(e_value["attachment"]["mimetype"], 'ifExists', 'string');
        }

        /**
         * Get attachment map
         */
        //attachment map file name
        let e_attachment_map_filename = e_key + '.json';

        //attachments map path
        //attachments_map/{assetId}/{submissionId}/{field.autoname}.json
        let e_attachment_map_file_path = Utils.toPath([e_attachment_map_dir_path, e_attachment_map_filename]);
        
        let current_attachment_map_o = null;
        let e_has_attachment_map = false;
        if(Utils.fileExists(e_attachment_map_file_path)) {
          current_attachment_map_o = Utils.parseJSONFile(e_attachment_map_file_path);
          let isAttachmentMapOk = Utils.isValidAttachmentMap(current_attachment_map_o);
          //check
          if(!isAttachmentMapOk) {
            /**
             * Warning: attachment map not ok.
             */
            let warning = `attachment map wasn't ok: ${e_attachment_map_file_path}`;
            warnings.push(warning);
          } else e_has_attachment_map = true;
        }
        
        /**
         * Case: keep
         */
        if(e_value.action === 'keep') {
           try{
            /**
             * The following checks will be done before start to
             * download an image:
             * 
             *  - Exists?
             *      - yes: is up to date?
             *              - yes:  up to date.
             *                      - has valid hash?
             *                          - yes: ok, no need download.
             *                          - no: download.
             *              - no:   download.
             *      - no: download
             * 
             * In order to confirm if an existing image is up to date,
             * an attachment map is created and stored for each downloaded
             * image. The map is stored in the following path:
             * 
             *    output/images/.attachmentMap/{assetId}/{submissionId}/{field.autoname}.json
             * 
             * There will be a json map for each image that is downloaded. Each map will
             * be of the following form:
             * 
             * {
             *    "imageName":"1721_1579374170278.jpg",
             *    "originalName":"1579374170278.jpg",
             *    "attachmentId":2395,
             *    "saveTimestamp":"2020-11-17-19-41-36",
             *    "imgInfo":{
             *    "hash":[-240650581,1759009758,-738380866,-1252016960,-1117734626,-2098850447,-1669759583,1939428331],
             *    "width":2976,
             *    "height":3968,
             *    "dimensions":"width: 2976 pixels, height: 3968 pixels",
             *    "assetUid":"aeUTa3g2VzbPP5SGoTx8Rp",
             *    "assetName":"GEF_colectas_RG016",
             *    "recordId":1721,
             *    "name":"1721_1579374170278.jpg",
             *    "type":"image/jpeg",
             *    "size":4132284,
             *    "sizeMB":"4.13MB"
             *    }
             *  }
             * 
             * If there is no attachment map for an existing image, it will be
             * downloaded again.
             * 
             * Up to date check:
             *    - Checks if attachment id in the map is equal to the current
             *      attachment id: if equals image is up to date.
             * 
             * Integrity check:
             *    - Checks if the hash in the map is equal to the hash of the
             *      image currently stored: if equals the image has integrity.
             */
            //attachment download url
            let e_attachment_download_url = e_value.attachment.download_url;
            //attachment id
            let e_attachment_id = e_value.attachment.id;
            
            //image new name
            let img_new_name = emap["_id"] + '_' + e_value.value;
            /**
             * Check: duplicated names
             * 
             * This only could occurs with images of the same submission.
             */
            if(imageNamesToKeep.includes(img_new_name)) {
              /**
               * Error: image filename is duplicated.
               */
              let error = `in action 'keep': image name is duplicated: ${img_new_name}`;
              imageNamesToKeepDuplicated.push(img_new_name);

              throw new Error(error);
            } else imageNamesToKeep.push(img_new_name);

            //attachment map object
            let e_attachment_map_o = {
              imageName: img_new_name,
              originalName: e_value.value,
              attachmentId: e_attachment_id
            };
            
            //image path
            //images/{assetId}/{assetName}/filename
            let e_img_file_path = Utils.toPath([e_img_dir_path, img_new_name]);
                        
            /**
             * Checks
             *
             * The following checks will be done before start to
             * download an image:
             * 
             *  - Exists?
             *      - yes: is up to date?
             *              - yes:  up to date.
             *                      - has valid hash?
             *                          - yes: ok, no need download.
             *                          - no: download.
             *              - no:   download.
             *      - no: download
             */
            //check
            let imgExists = Utils.fileExists(e_img_file_path);
            if(!imgExists && Utils.pathExists(e_img_file_path)) {
              /**
               * Error: image filename exists but is not a file.
               */
              let error = `image name exists but is not a regular file - cannot store the image in: ${e_img_file_path}`;
              throw new Error(error);
            }
            //check

            let imgIsUpToDate = true;
            if(imgExists && e_has_attachment_map) {
              //check
              if(current_attachment_map_o.imageName !== img_new_name) imgIsUpToDate = false;
              else if(current_attachment_map_o.attachmentId !== e_attachment_id) imgIsUpToDate = false;
              else if(!Utils.isValidFileHash(e_img_file_path, current_attachment_map_o.imgInfo.hash)) imgIsUpToDate = false;
            } else imgIsUpToDate = false;             
            
            /**
             * Case: image up to date.
             */
            if(imgExists && imgIsUpToDate) {
              //prepare image info 
              let imgInfo = current_attachment_map_o.imgInfo;
              //append image info
              Utils.appendFile(e_images_info_file_path, `${imgInfo.assetUid},${Utils.getCsvString(imgInfo.assetName)},${imgInfo.recordId},${Utils.getCsvString(imgInfo.name)},${imgInfo.size},${Utils.getCsvString(imgInfo.sizeMB)},${Utils.getCsvString(imgInfo.type)},${Utils.getCsvString(imgInfo.dimensions)},${imgInfo.width},${imgInfo.height}, ${Utils.getCsvString(JSON.stringify(imgInfo.hash))}`, {onNewLine: true});

              //prepare result: add status + updated_path + action_detail
              _result[e_key] = { ...emap[e_key], status: 'ok', op: "saveImage", updated_path: e_img_file_path, action_detail: `image up to date` };
              
              //report
              let result_msg = `image ${colors.green.dim('up to date')}`;
              let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, img_new_name, result_msg);
              Utils.log(_configs.runLogPath, _report);

              //count
              upToDate++;
              continue;
            }else {
              /**
               * Case: download.
               */
              /**
               * FS handler
               */
              let options = {..._configs, step_log_path};
              let result = await saveImage(e_attachment_download_url, e_img_dir_path, img_new_name, options);
              //internal
              check(result, 'mustExists', 'object');
              check(result.contentLength, 'defined', 'number');
              check(result.contentType, 'ifDefined', 'string');
              
              //prepare image info 
              let imgInfo = await Utils.getImgInfo(join(e_img_dir_path, img_new_name));
              //internal
              check(imgInfo.dimensions, 'mustExists', 'string');
              check(imgInfo.width, 'defined', 'number');
              check(imgInfo.height, 'defined', 'number');
              check(imgInfo.hash, 'mustExists', 'array');
              //add additional image info
              imgInfo.assetUid = asset.uid;
              imgInfo.assetName = asset.name;
              imgInfo.recordId = emap["_id"];
              imgInfo.name = img_new_name;
              imgInfo.type = result.contentType ? result.contentType : e_value["attachment"]["mimetype"];
              imgInfo.size = result.contentLength;
              imgInfo.sizeMB = (Math.round(((imgInfo.size/(1000*1000))*100)+ Number.EPSILON)/100).toString()+'MB';
              //add to result
              result.imgInfo = imgInfo;
              //append image info
              Utils.appendFile(e_images_info_file_path, `${Utils.getCsvString(imgInfo.assetUid)},${Utils.getCsvString(imgInfo.assetName)},${imgInfo.recordId},${Utils.getCsvString(imgInfo.name)},${imgInfo.size},${Utils.getCsvString(imgInfo.sizeMB)},${Utils.getCsvString(imgInfo.type)},${Utils.getCsvString(imgInfo.dimensions)},${imgInfo.width},${imgInfo.height}, ${Utils.getCsvString(JSON.stringify(imgInfo.hash))}`, {onNewLine: true});
              
              //prepare attachment map
              e_attachment_map_o.saveTimestamp = Utils.getCurrentTimestamp();
              e_attachment_map_o.imgInfo = imgInfo;
              //write attachment map
              Utils.writeFile(e_attachment_map_file_path, JSON.stringify(e_attachment_map_o));

              //prepare result: add status + updated_path + action_detail
              let op = {op: "saveImage", status: 'ok', result, updated_path: e_img_file_path, action_detail: `image downloaded`};
              _result[e_key] = { ...emap[e_key], ...op};

              //report
              let result_msg = `image ${colors.green('downloaded')}`;
              let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, img_new_name, result_msg);
              Utils.log(_configs.runLogPath, _report);
              
              //count
              downloads++;

              continue;
            }
          } catch(error) {
            //prepare result: add status + error
            _result[e_key] = { ...emap[e_key], status: 'error', op: "saveImage", error: error.message };
            //push error
            let _error = `an error occurs while proccessing image - error: ${error.message}`;
            errors.push(_error);

            //report
            let result_msg = colors.red(error.message) + colors.yellow(' (skipped)');
            let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, `image field: ${e_key}`, result_msg);
            Utils.log(_configs.runLogPath, _report);
            Utils.log(_configs.runLogPath, `${colors.red(error.name)}: ${error.message}`);
            Utils.log(_configs.runLogPath, `${colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1))}`);

            continue;
          }
        }//end: case: 
        
        /**
         * Case: delete
         */
        if(e_value.action === 'delete') {
          try{
            //case: has attachment map
            if(e_has_attachment_map) {
              let img_name = current_attachment_map_o.imageName;
              let img_hash = current_attachment_map_o.hash;

              /**
               * Check: duplicated names
               * 
               * This only could occurs with images of the same submission.
               */
              //check
              if(imageNamesToKeep.includes(img_name)) {
                /**
                 * Error: image filename is duplicated.
                 */
                let error = `in action 'delete': image name is duplicated in to-keep list: ${img_name}`;
                imageNamesToDeleteDuplicated.push(img_name);

                throw new Error(error);
              } else if(imageNamesToDelete.includes(img_name)) {
                /**
                 * Error: image filename is duplicated.
                 */
                let error = `in action 'delete': image name is duplicated in to-delete list: ${img_name}`;
                imageNamesToDeleteDuplicated.push(img_name);

                throw new Error(error);
              } else imageNamesToDelete.push(img_name);

              //images paths
              //images/{assetId}/{assetName}/
              let e_img_dir_path = Utils.toPath([_configs.imagesPath, asset.uid, assetName]);
              //images/{assetId}/{assetName}/filename
              let e_img_file_path = Utils.toPath([e_img_dir_path, img_name]);
              
              let imgExists = Utils.fileExists(e_img_file_path);
              //check
              if(imgExists) {
                /**
                 * Check: hash
                 */
                if(!Utils.isValidFileHash(e_img_file_path, img_hash)) {
                  /**
                   * Error: different hashes
                   */
                  let error = `trying to remove an image with a different hash than the image that was stored originally : ${e_img_file_path}`;
                  throw new Error(error);
                }
                /**
                 * Ok to delete
                 */
                //case: delete
                if(_configs.deleteImages) {
                  Utils.deletePath(e_img_file_path);

                  //prepare result: add status + updated_path + action_detail
                  let op = {op: "deleteImage", status: 'ok', updated_path: e_img_file_path, action_detail: `image deleted`};
                  _result[e_key] = { ...emap[e_key], ...op};

                  //report
                  let result_msg = `image ${colors.red('deleted')}`;
                  let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, img_name, result_msg);
                  Utils.log(_configs.runLogPath, _report);

                  //count
                  deletes++;
                  continue;
                } else { //case: mv
                  //imagesDeletedPath/filename
                  let e_img_file_new_path = Utils.toPath([_configs.imagesDeletedPath, img_name]);

                  Utils.mvFile(e_img_file_path, e_img_file_new_path);

                  //prepare result: add status + updated_path + action_detail
                  let op = {op: "deleteImage", status: 'ok', updated_path: {oldPath: e_img_file_path, newPath: e_img_file_new_path}, action_detail: `image moved to 'images_deleted' dir`};
                  _result[e_key] = { ...emap[e_key], ...op};

                  //report
                  let result_msg = `image ${colors.red('moved')} to 'images_deleted' dir`;
                  let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, img_name, result_msg);
                  Utils.log(_configs.runLogPath, _report);

                  //count
                  deletes++;
                  continue;
                }
              }//end: case: image exists
              else {//case: image does not exists
                //prepare result: add status + updated_path + action_detail
                let op = {op: "deleteImage", status: 'ok', target_path: e_img_file_path, action_detail: `image does not exists`};
                _result[e_key] = { ...emap[e_key], ...op};

                //report
                let result_msg = `image does ${colors.red.dim('not exists')}`;
                let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, img_name, result_msg);
                Utils.log(_configs.runLogPath, _report);

                //count
                nones++;
                continue;
              }
            }//end: case: has attachment map
            else {//case: has not attachment map
              //prepare result: add status + updated_path + action_detail
              let op = {op: "deleteImage", status: 'ok', target_path: null, action_detail: `image cannot be deleted in this phase: has no attachment info`};
              _result[e_key] = { ...emap[e_key], ...op};

              //report
              let result_msg = `has no filename: if exists ${colors.red.dim('will be cleaned')}`;
              let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, `image field: ${e_key}`, result_msg);
              Utils.log(_configs.runLogPath, _report);

              //count
              nones++;
              continue;
            }
          } catch(error) {
            //prepare result: add status + error
            _result[e_key] = { ...emap[e_key], status: 'error', op: "deleteImage", error: error.message };
            //push error
            let _error = `an error occurs while proccessing image - error: ${error.message}`;
            errors.push(_error);

            //report
            let result_msg = colors.red(error.message) + colors.yellow(' (skipped)');
            let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, `image field: ${e_key}`, result_msg);
            Utils.log(_configs.runLogPath, _report);
            Utils.log(_configs.runLogPath, `${colors.red(error.name)}: ${error.message}`);
            Utils.log(_configs.runLogPath, `${colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1))}`);

            continue;
          }
        }

        /**
         * Case: none
         */
        if(e_value.action === 'none') {
          //prepare result: add status + updated_path + action_detail
          let op = {op: "none", status: 'ok', target_path: null, action_detail: `image field has name but attachment: if exists, will be moved to 'images_deleted' dir`};
          _result[e_key] = { ...emap[e_key], ...op};

          //report
          let result_msg = `has no attachment: if exists ${colors.red.dim('will be cleaned')}`;
          let _report = Utils.getActionReportLine(emap["_id"], m+1, asset.map.length, e_value.action, ++action_count, mapCounters.totalActions, j+1, _emap_entries.length, `image field: ${e_key}`, result_msg);
          Utils.log(_configs.runLogPath, _report);

          //count
          nones++;
          continue;
        }
      }//end: for each emap entry (for each submission)
      
      //add result
      images_update_run.push(_result);
      //count
      assetsProcessed++;
    }//end: for each map entry

    //prepare counters
    actions = downloads + upToDate + deletes + nones;
    let mapRunnerCounters = {downloads, upToDate, deletes, nones, totalActions: actions+'/'+mapCounters.totalActions, warnings: warnings.length, errors: errors.length}; 
    if(!warnings.length) delete mapRunnerCounters.warnings;
    if(!errors.length) delete mapRunnerCounters.errors;

    //report: (image cleaner)
    await imc.showProgress();
    imc.showReport();
    //report: (asset level)
    Utils.log(_configs.runLogPath, `[${colors.cyan('ok')}]${assetIdColor(asset.uid)} ${colors.brightWhite.bold(`${asset.name}:`)}`, {noNewLine:true});
    Utils.printReportCounters([{counters: mapRunnerCounters}], _configs.runLogPath, {noTimestamp:true});
    Utils.printWarnings(warnings, _configs.runLogPath);
    Utils.log(_configs.runLogPath, colors.cyan(`-----------------\n`));

    /**
     * Set total counters
     */
    // --cleaner--
    let cleaned = imc.cleaned;
    let cleanErrors = imc.errors;
    totalCleaned += cleaned.length;
    totalCleanErrors += cleanErrors.length;
    totalCleanActions += imc.totalActions;
    totalCleanActionsExecuted += imc.totalActionsExecuted;
    let imageCleanerReport = {cleaned, cleanErrors, totalCleaned, totalCleanErrors, totalCleanActions, totalCleanActionsExecuted}
    // --submissions--
    totalDownloads += downloads;
    totalUpToDate += upToDate;
    totalDeletes += deletes;
    totalNones += nones;
    totalWarnings += warnings.length;
    totalErrors += errors.length;
    totalActions += actions;
    
    //add asset + images_update_run
    results = [...results, {...asset, mapRunnerReport: {mapsRunned: images_update_run, mapRunnerCounters }, imageCleanerReport}];

    //write result
    let step_log_file = join(step_log_path,`${asset.uid}-${stepId}-result.json`);
    Utils.writeFile(step_log_file, JSON.stringify(results, null, 2), {async:false});
  }//end: for each asset

  //prepare report
  totalResults = results.length;
  let countersA = {totalCleaned, totalCleanErrors, totalCleanActions, totalCleanActionsExecuted};
  let countersB = {totalDownloads, totalUpToDate, totalDeletes, totalNones, totalWarnings, totalErrors, totalActions};
  let countersC = {assetsCount, assetsProcessed, assetsFiltered, totalResults};
  //remove empty errors and warnings
  if(!totalCleanErrors) delete countersA.totalCleanErrors;
  if(!totalWarnings) delete countersB.totalWarnings;
  if(!totalErrors) delete countersB.totalErrors;

  //set status
  status  = (!totalCleanErrors && !totalErrors);
  //report
  Utils.log(_configs.runLogPath, status ? colors.brightCyan('ok') : colors.red('fail'));
  Utils.printReportCounters([{counters: countersA}], _configs.runLogPath);
  Utils.printReportCounters([{counters: countersB}], _configs.runLogPath);
  Utils.printReportCounters([{counters: countersC}], _configs.runLogPath);
  Utils.log(_configs.runLogPath, separatorColor(`-----------------\n`));

  if(status) return results;
  else throw new Error('step completed with failed operations');
}


/**
 * uncaughtException
 */
process.on('uncaughtException', error => {
  console.log('\n'+colors.red(error.name)+':', error.message);
  console.log(colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1)));
  process.exit(1);
});