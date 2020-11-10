import {getAssets, getAssetInfo, getSubmissions} from './modules/kobo-api.js';
import {saveImage, writeLog} from './modules/kobo-imgs-fs.js';
import * as Utils from './modules/utils.js';
import * as Configs from './modules/configs.js'
import { check, confirm, isOfType } from './modules/checks.js';
import program from 'commander';
import colors from 'colors/safe.js';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const assetIdColor = colors.cyan.dim.bold;
const indexIndicatorColor = colors.cyan;
const separatorColor = colors.grey.bold;
const titleColor = colors.brightCyan;

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
  .option('-d, --delete-images', 'Remove images instead of following the default behavior of moving them to the images_deleted dir.')
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
  //msg
  console.log(`process completed.`);
  console.log(colors.green('done'));
  console.log(`-----------------\n`);
  process.exit(0);
}

async function run( step, stepId, totalSteps, results ) {
  //internal
  check(step, 'mustExists', 'function');
  check(stepId, 'defined', 'number');
  check(totalSteps, 'mustExists', 'number');
  check(results, 'mustExists', 'object');

  //msg
  process.stdout.write('  ' + titleColor(stepId) + ' - ');

  let _step = `step${stepId}`;
  let _prevStep = `step${stepId-1}`;
  try {
    results[_step] = await step(results[_prevStep]);
    //internal
    check(results[_step], 'mustExists', 'array');

    //check
    if(results[_step].length === 0) {
      console.log(`process finished at step`, stepId, 'of', totalSteps);
      console.log(colors.yellow('done'));
      console.log(`-----------------\n`);
      process.exit(1);
    }
  } catch(error) {
    console.log(`step ${stepId}`, colors.red('fails'));
    console.log(colors.red(error.name)+':', error.message);
    console.log(colors.gray(error.stack.slice(error.name.length + error.message.length + 2 + 1)));
    console.log(colors.red('done'));
    console.log(`-----------------\n`);
    process.exit(1);
  }
}

/**
 * step1  get assets list.
 */
async function step1() {
  //msg
  console.log(colors.brightCyan('get assets'));
 
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
  check(result.report, 'mustExists', 'array');
  check(result.status, 'defined', 'boolean');

  //report
  console.log(result.status ? colors.brightCyan('  ok') : colors.red('  fail'), '\n');
  Utils.printReportCounters(result.report);
  console.log(separatorColor(`  -----------------\n`));

  //log result
  let result_log_path = join(_configs.stepsPath, 'step1_result.json');
  Utils.writeFile(result_log_path, JSON.stringify(result, null, 2));

  //overall status
  let status = result.status;

  if(status) return result.results;
  else throw new Error('step reported failed operations');
}

/**
 * step2  get assets image-fields.
 */
async function step2(input) {
  //internal
  check(input, 'mustExists', 'array');

  //msg
  console.log(colors.brightCyan('get assets image-fields'));
  
  //input
  let assets = input;

  /**
   * Set required keys
   */
  let r_asset_keys = ["uid"];

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
  let options = {..._configs, resFilters: {jq: jq}};
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

    //check
    if(asset.deployment__submission_count === 0) {
      process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': has no submissions - ' + colors.yellow('(skipped)\n'));
      //count
      assetsFiltered++;
      continue;
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
    process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' +indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': ');
    if(result.status) {
      let imgCounters = result.results.map(r => ({counters: {totalImgsFields: r.imgs.length}}));
      Utils.printReportCounters(imgCounters); 
    } else {
      process.stdout.write(colors.red('  fail'));
    }

    //update overall status
    status = status && result.status;
  }//end: for each asset

  //report
  totalResults = results.length;
  console.log(status ? colors.brightCyan('  ok') : colors.red('  fail'), '\n');
  Utils.printReportCounters([{counters: {assetsCount, assetsFetched, assetsFiltered, totalResults}}]);
  console.log(separatorColor(`  -----------------\n`));

  //log result
  let result_log_path = join(_configs.stepsPath, 'step2_result.json');
  Utils.writeFile(result_log_path, JSON.stringify(results, null, 2));
  

  if(status) return results;
  else throw new Error('step reported failed operations');
}

/**
 * step3  get assets submissions.
 */
async function step3(input) {
  //internal
  check(input, 'mustExists', 'array');

  //msg
  console.log(colors.brightCyan('get submissions'));
  
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
    check(asset.imgs, 'mustExists', 'array');

    //check
    if(asset.imgs.length === 0) {
      process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': has no image fields - ' + colors.yellow('(skipped)\n'));
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
    let options = {..._configs, resFilters: {jq: jq}};
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
    process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': ');
    if(result.status) {
      let subCounters = [{ counters: {totalSubmissions: result.results.length}}];
      Utils.printReportCounters(subCounters); 
    } else {
      process.stdout.write(colors.red('  fail'));
    }

    //update overall status
    status = status && result.status;
  }//end: for each asset

  //report
  totalResults = results.length;
  console.log(status ? colors.brightCyan('  ok') : colors.red('  fail'), '\n');
  Utils.printReportCounters([{counters: {assetsCount, assetsFetched, assetsFiltered, totalResults}}]);
  console.log(separatorColor(`  -----------------\n`));

  //log result
  let result_log_path = join(_configs.stepsPath, 'step3_result.json');
  Utils.writeFile(result_log_path, JSON.stringify(results, null, 2));
  
  if(status) return results;
  else throw new Error('step reported failed operations');
}

/**
 * step4()  build action map
 */
async function step4(input) {
  //internal
  check(input, 'mustExists', 'array');

  //msg
  console.log(colors.brightCyan('build action map'));
  
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
      process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': has no submissions - ' + colors.yellow('(skipped)\n'));
      //count
      assetsFiltered++;
      continue;
    }
    if(asset.imgs.length === 0) {
      process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': has no images fields - ' + colors.yellow('(skipped)\n'));
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

    //add asset + map + counters
    let mapCounters = {keeps, deletes, nones, totalActions: _totalActions, warnings: warnings.length}; 
    if(!warnings.length) delete mapCounters.warnings;
    
    results.push({...asset, map, mapCounters});

    //count
    assetsProcessed++;

    //report
    process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': ');
    if(status) {
      Utils.printReportCounters([{counters: mapCounters}]);
      if(warnings.length > 0) Utils.printWarnings(warnings);
    } else {
      process.stdout.write(colors.red('  fail'));
    }

    //log
    //await writeLog(e_runlog_attachment_dir_path, e_s_attachment_id, result);

  }//end: for each asset

  //report
  totalResults = results.length;
  console.log(status ? colors.brightCyan('  ok') : colors.red('  fail'), '\n');
  Utils.printReportCounters([{counters: {assetsCount, assetsProcessed, assetsFiltered, totalResults,}}]);
  let countersB = {totalKeeps, totalDeletes, totalNones, totalActions, totalWarnings};
  if(!totalWarnings.length) delete countersB.totalWarnings;
  Utils.printReportCounters([{counters: countersB}]);
  console.log(separatorColor(`  -----------------\n`));

  //log result
  let result_log_path = join(_configs.stepsPath, 'step4_result.json');
  Utils.writeFile(result_log_path, JSON.stringify(results, null, 2));

  if(status) return results;
  else throw new Error('step reported failed operations');
}

/**
 * step5  update images
 */
async function step5(input) {
  //internal
  check(input, 'mustExists', 'array');

  //msg
  console.log(colors.brightCyan('update images'));
  
  //input
  let assets = input;

  //counters
  let totalDownloads = 0;
  let totalUpToDate = 0;
  let totalDeletes = 0;
  let totalNones = 0;
  let totalWarnings = 0;
  let totalErrors = 0;
  let totalImagesChecked = 0;

  let assetsCount = assets.length;
  let assetsProcessed = 0;
  let assetsFiltered = 0;
  let totalResults = 0;

  //overall status
  let status = true;

  //get target_dir
  let target_dir = _configs.imagesPath;

  //for each asset
  let results = [];
  for(let i=0; i<assets.length; i++) {
    let asset = assets[i];
    //internal
    check(asset, 'mustExists', 'object');
    check(asset.uid, 'mustExists', 'string');
    check(asset.name, 'mustExists', 'string');
    check(asset.map, 'mustExists', 'array');

    //check
    if(asset.map.length === 0) {
      process.stdout.write('  ' + '['+ indexIndicatorColor(i+1) + '/' + indexIndicatorColor(assets.length) + ']' + assetIdColor(asset.uid) + ': has no map actions - ' + colors.yellow('(skipped)\n'));
      //count
      assetsFiltered++;
      continue;
    }

    //get asset.name
    let assetName = asset.name;

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
    let imagesChecked = 0;
  
    /**
     * Execute action map
     */
    //for each map item
    let images_update_run = [];
    let _ids = [];
    for(let m=0; m<asset.map.length; m++) {
      let emap = asset.map[m];
      let _result = {};
      //internal
      check(emap, 'mustExists', 'object');
      check(emap["_id"], 'defined', 'number');

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
          check(e_value["attachment"]["id"], 'defined', 'number');}

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
          //check
          let isAttachmentMapOk = (true
          && confirm(current_attachment_map_o, 'exists') && isOfType(current_attachment_map_o, 'object')
          && confirm(current_attachment_map_o.imageName, 'exists') && isOfType(current_attachment_map_o.imageName, 'string')
          && confirm(current_attachment_map_o.originalName, 'exists') && isOfType(current_attachment_map_o.originalName, 'string')
          && confirm(current_attachment_map_o.attachmentId, 'defined') && isOfType(current_attachment_map_o.attachmentId, 'number')
          && confirm(current_attachment_map_o.hash, 'exists') && isOfType(current_attachment_map_o.hash, 'array'));
          //check
          if(!isAttachmentMapOk) {
            /**
             * Warning: attachment map not ok.
             */
            let warning = `attachment map is not ok: ${e_attachment_map_file_path}`;
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
             *              - yes:  up to date, no need download.
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
             *    imageName: "imageName.jpg"  //as is stored in output/images dir.
             *    attachmentId: id            //id of the corresponding attachment.
             *    downloadTimestamp           //timestamp of the download event.
             * }
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
            
            //images paths
            //images/{assetId}/{assetName}/
            let e_img_dir_path = Utils.toPath([target_dir, asset.uid, assetName]);
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
              else if(!Utils.isValidFileHash(e_img_file_path, current_attachment_map_o.hash)) imgIsUpToDate = false;
            } else imgIsUpToDate = false;             
            
            /**
             * Case: image up to date.
             */
            if(imgExists && imgIsUpToDate) {
              //prepare result: add status + updated_path + action_detail
              _result[e_key] = { ...emap[e_key], status: 'ok', op: "saveImage", updated_path: e_img_file_path, action_detail: `image up to date` };
              //report
              process.stdout.write('  ' + '['+ indexIndicatorColor(j+1) + '/' + indexIndicatorColor(_emap_entries.length) + ']' + assetIdColor(img_new_name) + ': image up to date \n');
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
              let options = {..._configs};
              let result = await saveImage(e_attachment_download_url, e_img_dir_path, img_new_name, options);

              //prepare result: add status + updated_path + action_detail
              let op = {op: "saveImage", status: 'ok', result, updated_path: e_img_file_path, action_detail: `image downloaded`};
              _result[e_key] = { ...emap[e_key], ...op};
              
              //report
              process.stdout.write('  ' + '['+ indexIndicatorColor(j+1) + '/' + indexIndicatorColor(_emap_entries.length) + ']' + assetIdColor(img_new_name) + ': image downloaded');
              
              //count
              downloads++;

              //add timestamp & hash to attachment map
              e_attachment_map_o.downloadTimestamp = Utils.getCurrentTimestamp();
              e_attachment_map_o.hash = Utils.getFileHash(e_img_file_path);
              //write attachment map
              Utils.writeFile(e_attachment_map_file_path, JSON.stringify(e_attachment_map_o));
              continue;
            }
          } catch(error) {
            //prepare result: add status + error
            _result[e_key] = { ...emap[e_key], status: 'error', op: "saveImage", error: error.message };
            //push error
            let _error = `an error occurs while proccessing image - error: ${error.message}`;
            errors.push(_error);
            //report
            process.stdout.write('  ' + '['+ indexIndicatorColor(j+1) + '/' + indexIndicatorColor(_emap_entries.length) + ']' + assetIdColor([emap["_id"], e_key].join('_')) + ':' +colors.red(error) + ' ' + error.message + colors.red(' (skipped)\n'));
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
              } else imageNamesToDelete.push(img_new_name);

              //images paths
              //images/{assetId}/{assetName}/
              let e_img_dir_path = Utils.toPath([target_dir, asset.uid, assetName]);
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
                } else { //case: mv
                  //imagesDeletedPath/filename
                  let e_img_file_new_path = Utils.toPath([_configs.imagesDeletedPath, img_name]);

                  Utils.mvFile(e_img_file_path, e_img_file_new_path);

                  //prepare result: add status + updated_path + action_detail
                  let op = {op: "deleteImage", status: 'ok', updated_path: {oldPath: e_img_file_path, newPath: e_img_file_new_path}, action_detail: `image moved to 'images_deleted' dir`};
                  _result[e_key] = { ...emap[e_key], ...op};
                }
              }//end: case: image exists
              else {//case: image does not exists
                //prepare result: add status + updated_path + action_detail
                let op = {op: "deleteImage", status: 'ok', target_path: e_img_file_path, action_detail: `image does not exists`};
                _result[e_key] = { ...emap[e_key], ...op};
              }
            }//end: case: has attachment map
            else {//case: has not attachment map
              //prepare result: add status + updated_path + action_detail
              let op = {op: "deleteImage", status: 'ok', target_path: null, action_detail: `image cannot be deleted in this phase: has no attachment info`};
              _result[e_key] = { ...emap[e_key], ...op};
            }
            continue;
          } catch(error) {
            //prepare result: add status + error
            _result[e_key] = { ...emap[e_key], status: 'error', op: "deleteImage", error: error.message };
            //push error
            let _error = `an error occurs while proccessing image - error: ${error.message}`;
            errors.push(_error);
            //report
            process.stdout.write('  ' + '['+ indexIndicatorColor(j+1) + '/' + indexIndicatorColor(_emap_entries.length) + ']' + assetIdColor([emap["_id"], e_key].join('_')) + ':' +colors.red(error) + ' ' + error.message + colors.red(' (skipped)\n'));
            continue;
          }
        }

      }//end: for each emap entry
      
      //add result
      images_update_run.push(_result);
    }//end: for each map entry

    /**
     * Phase: Remove _id's
     * 
     * 1. Get all dir names corresponding to _id's
     * 2. Remove dirs whose name is not in the run map
     */
    //get asset path
    // let asset_path = Utils.toPath([target_dir, asset.uid, assetName]);
    // //get asset path entries
    // let asset_path_entries = Utils.getDirEntries(asset_path, {dirsOnly: true, numericOnly: true});
    
    // //for each asset path entry:
     let records_delete_run = [];
    // for(let i=0; i<asset_path_entries.length; i++) {
    //     let _result = {};
    //     let e = asset_path_entries[i];
    //     let e_int = parseInt(e, 10);

    //     //add _id
    //     _result["_id"] = e_int;

    //     /**
    //      * Case: keep
    //      */
    //     if(_ids.includes(e_int)) {
    //       _result = {..._result, action: 'keep', status: 'ok'};
    //     } else {
    //       /**
    //        * Case: delete
    //        */
    //       try{
    //         let asset_path_e = Utils.toPath([asset_path, e]);
    //         let result = Utils.deletePath(asset_path_e);
    //         _result = {..._result, action: 'delete', status: 'ok', deletedPath: asset_path_e, action_detail: result ? 'path deleted' : 'path does not exists'};
    //       } catch(error) {
    //         //add status + error
    //         _result = {..._result, action: 'delete', status: 'error', targetPath: asset_path_e, error: error.message};
    //       }
    //     }

    //     records_delete_run.push(_result);
    // }//end: for each asset path entry

    //add asset + images_update_run
    results = [...results, {...asset, images_update_run, records_delete_run}];
  }
  //msg
  //console.log(`@ results:`, JSON.stringify(results, null, 2));
  console.log(`@ step5: ${results.length} results... done`);
  console.log(`  -----------------\n`);

  //log result
  let result_log_path = join(_configs.stepsPath, 'step5_result.json');
  Utils.writeFile(result_log_path, JSON.stringify(results, null, 2));

  return results;
}

/**
 * uncaughtException handler needed to prevent node from crashing upon receiving a malformed jq filter.
 */
process.on('uncaughtException', err => {console.log("!!uncaught exception:", err)});