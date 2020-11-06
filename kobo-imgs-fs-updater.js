import {getAssets, getAssetInfo, getSubmissions} from './modules/kobo-api.js';
import {saveImage, writeLog} from './modules/kobo-imgs-fs.js';
import * as Utils from './modules/utils.js';
import * as Configs from './modules/configs.js'
import { check } from './modules/checks.js';
import program from 'commander';
import colors from 'colors/safe.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Process comand line options
 */
program
  .description('KoBo image file-system updater.')
  .option('-f, --config-file <FILE>', 'JSON file with run configs.')
  .option('-s, --api-server-url <URL>', 'URL of the KoBo API server.')
  .option('-m, --media-server-url <URL>', 'URL of the KoBo media server.')
  .option('-o, --output-dir <DIR>', 'Directory where the run results will be stored')
  .option('-t, --token <TOKEN>', 'KoBo authentication token.')
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
  
  _configs = Configs.getConfigs(program, __dirname);
  Configs.setupOutputDir(_configs);
  start();

} catch(error) {
  console.log('\n'+colors.red(error.name)+':', error.message);
  console.log(colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1)));
  process.exit(1);
}

/**
 * start  run steps.
 */
async function start() {
  let results = {};
  let steps = [step1, step2, step3, step4, step5];
  for(let i=0; i<steps.length; i++) {
    await run( steps[i], i+1, steps.length, results );
  }
}

async function run( step, stepId, totalSteps, results ) {
  //internal
  check(step, 'mustExists', 'function');
  check(stepId, 'defined', 'number');
  check(totalSteps, 'mustExists', 'number');
  check(results, 'mustExists', 'object');

  //msg
  console.log("@@ running step: ", colors.cyan(stepId));

  let _step = `step${stepId}`;
  let _prevStep = `step${stepId-1}`;
  try {
    results[_step] = await step(results[_prevStep]);
    //internal
    check(results[_step], 'mustExists', 'array');

    //check
    if(results[_step].length === 0) {
      console.log(`@ process finished at step:`, stepId, 'of', totalSteps);
      console.log(`@`, colors.yellow('done'));
      process.exit(1);
    }
  } catch(error) {
    console.log(`@ step ${stepId}: `, colors.red('fail'));
    console.log('\n'+colors.red(error.name)+':', error.message);
    console.log(colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1)));
    console.log(`@ -----------------\n`);
    process.exit(1);
  }
}

/**
 * step1  get assets list.
 */
async function step1() {
  //msg
  console.log(`@ -----------------`, colors.cyan('get assets'));
 
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
    let select_asset_values_uid = await Utils.toJqSelectBody("uid", c_asset_values_uid, "==", "or");
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
  let options = {..._configs, resFilters: {jq: jq}};
  //get
  let result = await getAssets(options);
  //internal
  check(result, 'mustExists', 'object');
  check(result.results, 'mustExists', 'array');
  check(result.report, 'mustExists', 'object');
  check(result.status, 'defined', 'boolean');

  //msg
  console.log(result.status ? colors.cyan('ok') : colors.red('fail'), '- report:');
  console.log(result.report);
  console.log(`@ -----------------\n`);

  return result.results;
}

/**
 * step2  get assets image-fields.
 */
async function step2(assets) {
  //check
  if(!assets||!Array.isArray(assets)) throw new Error('expected array in @assets');
  //msg
  console.log(`@ -----------------`); console.log(`@ step2: get image fields... start`);

  //set attributes wanted
  let atts = ["uid"];

  /**
   * Configure filters 
   */
  //jq output object attributes
  let _atts = atts.map(item => `${item}: .${item}`);
  //jq select filter
  _atts.push('imgs: [.content.survey[]|select(.type=="image")]');
  let jq_atts = _atts.join(',');

  //jq filters
  let jq = [];
  jq.push(`.[]|[{${jq_atts}}]`);
  
  //for each asset
  let _results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];

    //checks
    if(!asset||typeof asset !== 'object'||!asset.uid) continue;
    if(!asset.deployment__submission_count||asset.deployment__submission_count <= 0) continue;
    if(!asset.uid) continue;

    let options = {filters: {jq: jq}};
    //get
    let results = await getAssetInfo(asset.uid, options);
    //check
    if(!results) { console.log(`@@ step2: null results for asset.uid: ${asset.uid}... done`); return };
    if(!Array.isArray(results)||!results.length) { console.log(`@@ step2: no results for asset.uid: ${asset.uid}... done`); return }; //convention

    //add asset + new asset attributes (including imgs attribute)
    results = results.map(result => ({...asset, ...result}));
    _results = [..._results, ...results];

  }//end: for each asset

  //msg
  //console.log(`@ results:`, JSON.stringify(_results, null, 2));
  console.log(`@ step2: ${_results.length} results... done`);
  console.log(`@ -----------------\n`);

  return _results;
}

/**
 * step3()  get assets submissions
 */
async function step3(assets) {
  //check
  if(!assets||!Array.isArray(assets)) throw new Error('expected array in @assets');
  //msg
  console.log(`@ -----------------`); console.log(`@ step3: get submissions... start`);

  //get config.filters
  let _filters = _configs&&_configs.filters ? _configs.filters : [];  

  //for each asset
  let _results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];

    //checks
    if(!asset||typeof asset !== 'object') continue;
    if(!asset.uid) continue;
    if(!asset.imgs || !Array.isArray(asset.imgs) || asset.imgs.length <= 0) continue;

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
      let select_submission_values__id = await Utils.toJqSelectBody("_id", c_submission_values__id, "==", "or");
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
    let options = {filters: {jq: jq}};
    //get
    let results = await getSubmissions(asset.uid, options);
    //check
    if(!results) { console.log(`@@ step3: null results for asset.uid: ${asset.uid}... done`); return };
    if(!Array.isArray(results)||!results.length) { console.log(`@@ step3: no results for asset.uid: ${asset.uid}... done`); return }; //convention

    //add asset + submissions
    _results = [..._results, {...asset, submissions: results}];
  }//end: for each asset

  //msg
  //console.log(`@ results:`, JSON.stringify(_results, null, 2));
  console.log(`@ step3: ${_results.length} results... done`);
  console.log(`@ -----------------\n`);

  return _results;
}

/**
 * step4()  build action map
 */
async function step4(assets) {
  //check
  if(!assets||!Array.isArray(assets)) throw new Error('expected array in @assets');
  //msg
  console.log(`@ -----------------`); console.log(`@ step4: build action map... start`);
  
  //for each asset
  let _results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];

    //checks
    if(!asset||typeof asset !== 'object') continue;
    if(!asset.uid) continue;
    if(!asset.imgs || !Array.isArray(asset.imgs) || asset.imgs.length <= 0) continue;
    if(!asset.submissions || !Array.isArray(asset.submissions) || asset.submissions.length <= 0) continue;

    //for each submission
    let map = asset.submissions.map((subm) => {
      let result = {};

      //internal checks
      if(!subm || typeof subm !== 'object') throw new Error(`expected object in @submission`);
      if(!subm["_attachments"] || !Array.isArray(subm["_attachments"])) throw new Error(`expected array in @_attachments`);
      if(!subm["@images_map"] || typeof subm["@images_map"] !== 'object' ) throw new Error(`expected object in @@images_map`);
      if(typeof subm["_id"] !== 'number') throw new Error(`expected number in @_id`);

      //add _id
      result["_id"] = subm["_id"];

      //for each image field in asset.imgs
      for(let j=0; j<asset.imgs.length; j++) {
        let imgField = asset.imgs[j];
        let imgField_map_a = subm["@images_map"][imgField["$autoname"]];
        //internal check
        if(!imgField_map_a || !Array.isArray(imgField_map_a)) throw new Error(`expected array in @@images_map element: ${imgField_map_a}`);
        //check
        if(imgField_map_a.length > 1) throw new Error(`expected one or zero entries in @@images_map element: ${imgField_map_a}`);


        let key = null;
        let value = undefined;

        /**
         * Case: img field has map (i.e. img field has key & value in submission object)
         */
        if(imgField_map_a.length === 1 ) {
          let imgField_map_a_e = imgField_map_a[0];
          //internal check
          if(!imgField_map_a_e || typeof imgField_map_a_e !== 'object') throw new Error(`expected object in @@images_map element: ${imgField_map_a_e}`);

          let imgField_map_a_e_entries = Object.entries(imgField_map_a_e);
          //check
          if(imgField_map_a_e_entries.length !== 1) throw new Error(`expected only one entry in @@images_map element: ${imgField_map_a_e_entries}`);
          let imgField_map_a_e_entries_e = imgField_map_a_e_entries[0];

          key = imgField_map_a_e_entries_e[0];
          value = imgField_map_a_e_entries_e[1];
        }

        let attachment = (value) ? Utils.findAttachment(value, subm["_attachments"], subm["_id"]) : null;
        let action = (value) ? 'keep' : 'delete';

        //add image field
        result[imgField["$autoname"]] = { value, attachment, action };
      }
      return result;
    });//end: for each submission

    //add asset + map
    _results = [..._results, {...asset, map}];

    //log
    //await writeLog(e_runlog_attachment_dir_path, e_s_attachment_id, result);

  }//end: for each asset
  //msg
  //console.log(`@ results:`, JSON.stringify(_results, null, 2));
  console.log(`@ step4: ${_results.length} results... done`);
  console.log(`@ -----------------\n`);

  return _results;
}

/**
 * step5()  update images
 */
async function step5(assets) {
  //check
  if(!assets||!Array.isArray(assets)) throw new Error('expected array in @assets');
  //msg
  console.log(`@ -----------------`); console.log(`@ step5: update images... start`);

  //get target_dir
  let target_dir = Utils.getTargetDir();

  //for each asset
  let _results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];

    //checks
    if(!asset||typeof asset !== 'object') continue;
    if(!asset.uid) continue;
    if(!asset.map || !Array.isArray(asset.map) || asset.map.length <= 0) continue;

    //get asset.name
    let assetName = asset.name || 'asset';

    //for each map item
    let images_update_run = [];
    let _ids = [];
    for(let m=0; m<asset.map.length; m++) {
      let item = asset.map[m];
      let _result = {};

      //checks
      if(!item || typeof item !== 'object') { console.log(`@@ error: expected object in @map element: ${item}`); return {}; }
      if(typeof item["_id"] !== 'number') { console.log(`@@ error: expected number in @_id`); return {}; }

      //get item entries
      let entries = Object.entries(item);

      //add _id
      _result["_id"] = item["_id"];
      //save _id
      _ids.push(item["_id"]);

      //for each entry
      for(let j=0; j<entries.length; j++) {
        let entry = entries[j];
        let e_key = entry[0];
        let e_value = entry[1];
        console.log("@@  map_entry: ", JSON.stringify(entry, null, 2))
        //internal check
        if(!e_value.value || typeof e_value.value !== 'string') throw new Error(`expected string in @.value: ${e_value.value}, @e_value: ${e_value}`);
        if(!e_value.attachment || typeof e_value.attachment !== 'object') throw new Error(`expected object in @attachment: ${e_value.attachment}`);
        if(!e_value.attachment.download_url || typeof e_value.attachment.download_url !== 'string') throw new Error(`expected string in attachment @download_url: ${e_value.attachment.download_url}`);
        if(typeof e_value.attachment.id !== 'number') throw new Error(`expected number in attachment @id: ${e_value.attachment.id}`);

        //check
        if(e_key === '_id') continue;

        let runOps = [];
        /**
         * Case: keep
         */
        if(e_value.action === 'keep') {
           try{
            //get attachment download url
            let e_url = e_value.attachment.download_url;
            //get attachment id
            let e_attachment_id = e_value.attachment.id;
            let e_s_attachment_id = e_attachment_id.toString()+'.json';
            //get image new name
            let img_new_name = item["_id"] + '_' + e_value.value;

            //get paths
            let e_dir_path = Utils.toPath([target_dir, asset.uid, assetName]);
            let e_file_path = Utils.toPath([target_dir, asset.uid, assetName, img_new_name]);
            let e_runlog_path = Utils.toPath([target_dir, "runlog", asset.uid, assetName, item["_id"], e_key]);
            let e_runlog_attachment_dir_path = Utils.toPath([e_runlog_path, "attachment"]);
            let e_runlog_attachment_file_path = Utils.toPath([e_runlog_path, "attachment", e_s_attachment_id]);
            
            if(Utils.fileExists(e_file_path) && Utils.fileExists(e_runlog_attachment_file_path)) {
              //add status + updated_path + action_detail
              _result[e_key] = { ...item[e_key], status: 'ok', op: "saveImage", updated_path: e_file_path, action_detail: `file already exists` };
              continue;
            }else {
              /**
               * FS handler
               */
              let result = await saveImage(e_url, e_dir_path, img_new_name);
              //add status + updated_path + action_detail
              let op = {op: "saveImage", status: 'ok', result, updated_path: e_file_path, action_detail: `file created`};
              runOps.push(op);
              _result[e_key] = { ...item[e_key], runOps};
              
              let opLog = await writeLog(e_runlog_attachment_dir_path, e_s_attachment_id, result);
              op.opLog = opLog;
              
              console.log("@result: ", JSON.stringify(_result[e_key], null, 2));
              continue;
            }
          } catch(error) {
            console.log("@@ error: ", error);
            //add status + error
            _result[e_key] = { ...item[e_key], status: 'error', op: "saveImage", error: error.message };
            continue;
          }
        }//end: case: 
        
        /**
         * Case: delete
         */
        if(e_value.action === 'delete') {
          try{
            //get path
            let e_dir_path = Utils.toPath([target_dir, asset.uid, assetName, item["_id"], e_key]);

            //delete
            let result = Utils.deletePath(e_dir_path);

            //add status + updated_path + action_detail
            _result[e_key] = { ...item[e_key], op: "Utils.deletePath", status: 'ok', result, updated_path: e_dir_path, action_detail: result ? 'path deleted' : 'path does not exists' };
            continue;

          } catch(error) {
            //add status + error
            _result[e_key] = { ...item[e_key], op: "Utils.deletePath", status: 'error', error: error.message };
            continue;
          }
        }

      }//end: for each map item entry
      
      //add result
      images_update_run.push(_result);
    }//end: for each map item

    /**
     * Phase: Remove _id's
     * 
     * 1. Get all dir names corresponding to _id's
     * 2. Remove dirs whose name is not in the run map
     */
    //get asset path
    let asset_path = Utils.toPath([target_dir, asset.uid, assetName]);
    //get asset path entries
    let asset_path_entries = Utils.getDirEntries(asset_path, {dirsOnly: true, numericOnly: true});
    
    //for each asset path entry:
    let records_delete_run = [];
    for(let i=0; i<asset_path_entries.length; i++) {
        let _result = {};
        let e = asset_path_entries[i];
        let e_int = parseInt(e, 10);

        //add _id
        _result["_id"] = e_int;

        /**
         * Case: keep
         */
        if(_ids.includes(e_int)) {
          _result = {..._result, action: 'keep', status: 'ok'};
        } else {
          /**
           * Case: delete
           */
          try{
            let asset_path_e = Utils.toPath([asset_path, e]);
            let result = Utils.deletePath(asset_path_e);
            _result = {..._result, action: 'delete', status: 'ok', deletedPath: asset_path_e, action_detail: result ? 'path deleted' : 'path does not exists'};
          } catch(error) {
            //add status + error
            _result = {..._result, action: 'delete', status: 'error', targetPath: asset_path_e, error: error.message};
          }
        }

        records_delete_run.push(_result);
    }//end: for each asset path entry

    //add asset + images_update_run
    _results = [..._results, {...asset, images_update_run, records_delete_run}];
  }
  //msg
  console.log(`@ results:`, JSON.stringify(_results, null, 2));
  console.log(`@ step5: ${_results.length} results... done`);
  console.log(`@ -----------------\n`);

  return _results;
}

/**
 * uncaughtException handler needed to prevent node from crashing upon receiving a malformed jq filter.
 */
process.on('uncaughtException', err => {console.log("!!uncaught exception:", err)});