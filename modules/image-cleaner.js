import { check } from './checks.js';
import * as Utils from './utils.js';
import { resolve, join } from 'path';
import ProgressBar from 'progress';
import colors from 'colors/safe.js';

class ImageCleaner {
  /**
   * Private properties
   */
  #map = [];
  #path = '';
  #cleanedPath = '';
  #deleteImages = false;
  #runLogPath = '';
  ///////internals//////
  #keeps = [];
  #deletes = [];
  #nones = [];
  #isRunning = false;
  #wasRan = false;
  //counters
  #totalActions = 0;
  #totalActionsExecuted = 0;
  #cleaned = [];
  #errors = [];

  /**
   * Private methods
   */
  #resetCounters() {
    this.#totalActions = 0;
    this.#totalActionsExecuted = 0;
    this.#cleaned = [];
    this.#errors = [];
  }
  
  /**
   * Constructor
   */
  constructor(map, path, cleanedPath, deleteImages, runLogPath) {
    this.map = map;
    this.path = path;
    this.cleanedPath = cleanedPath;
    this.deleteImages = deleteImages !== undefined ? deleteImages : false;
    this.runLogPath = runLogPath;
  }

  /**
   * Getters
   */
  get map() { 
    return [...this.#map]; 
  }
  get keeps() { 
    return [...this.#keeps]; 
  }
  get deletes() { 
    return [...this.#deletes]; 
  }
  get nones() { 
    return [...this.#nones]; 
  }
  get isRunning() { 
    return this.#isRunning; 
  }
  get wasRan() {
    return this.#wasRan;
  }
  get path() { 
    return this.#path; 
  }
  get cleanedPath() {
    return this.#cleanedPath;
  }
  get runLogPath() { 
    return this.#runLogPath; 
  }
  get totalActions() { 
    return this.#totalActions; 
  }
  get totalActionsExecuted() { 
    return this.#totalActionsExecuted; 
  }
  get cleaned() { 
    return [...this.#cleaned]; 
  }
  get errors() { 
    return [...this.#errors]; 
  }

  /**
   * Setters
   */
  set deleteImages(value) {
    //internal
    check(value, 'defined', 'boolean');

    //check
    if(this.#isRunning) throw new Error("ImageCleaner is running: cannot be alterated");

    //set#
    this.#deleteImages = value;
    this.#wasRan = false;
    this.#resetCounters();
  }

  set runLogPath(value) {
    //internal
    check(value, 'ifExists', 'string');

    /**
     * Can be changed on running
     */
    //set#
    this.#runLogPath = value ? value : '';
  }

  set path(value) {
    //internal
    check(value, 'ifExists', 'string');

    //check
    if(this.#isRunning) throw new Error("ImageCleaner is running: cannot be alterated");
    
    /**
     * Check: empty #path.
     *  run() will be throw with an empty #path.
     */
    if(!value) { 
      this.#path = ''; 
      this.#wasRan = false;
      this.#resetCounters(); 
      return; 
    }

    //make path
    if(!Utils.dirExists(value)) throw new Error(`path does not exists: ${value}`);

    //set#
    this.#path = value;
    this.#wasRan = false;
    this.#resetCounters();
  }

  set cleanedPath(value) {
    //internal
    check(value, 'ifExists', 'string');

    //check
    if(this.#isRunning) throw new Error("ImageCleaner is running: cannot be alterated");
    /**
     * Check: empty #cleanedPath.
     *  run() will be throw with an empty #cleanedPath.
     */
    if(!value) { 
      this.#cleanedPath = ''; 
      this.#wasRan = false;
      this.#resetCounters();
      return; 
    }

    //make path
    if(!Utils.dirExists(value)) Utils.makeDirPath(value);

    //set#
    this.#cleanedPath = value;
    this.#wasRan = false;
    this.#resetCounters();
  }

  set map(value) {
    //internal
    check(value, 'ifExists', 'array');

    //check
    if(this.#isRunning) throw new Error("ImageCleaner is running: cannot be alterated");

    /**
     * Check: empty #map.
     *  run() will be throw with an empty #map.
     */
    if(!value || !value.length) { 
      this.#map = ''; 
      this.#wasRan = false;
      this.#resetCounters();
      this.#keeps = [];
      this.#deletes = [];
      this.#nones = []; 
      return; 
    }

    /**
     * @map has the form:
     * 
     * "map": [
     *    {
     *     "_id": 5043,
     *     "pregunta1_001": {
     *       "value": "...name.jpg",
     *       "attachment": {
     *         "mimetype": "image/jpeg",
     *         "download_url": "...name.jpg",
     *         "filename": "...name.jpg",
     *         "instance": 5043,
     *         "id": 9466,
     *         "xform": 348
     *       },
     *       "action": "keep",
     *       "subm_mapped_key": "pregunta1_001"
     *     },
     *     ...
     * ]
     * 
     */
    //set#
    this.#map = [...value];
    this.#wasRan = false;
    this.#resetCounters();

    //for each map entry
    for(let i=0; i<this.#map.length; i++) {
      let emap = this.#map[i];

      //internal
      check(emap, 'mustExists', 'object');
      check(emap["_id"], 'defined', 'number');
      
      //get emap entries, excep _id
      let _emap = {...emap}; delete _emap['_id'];
      let _emap_entries = Object.entries(_emap);

      //for each emap entry, excep _id
      for(let j=0; j<_emap_entries.length; j++) {
        let entry = _emap_entries[j];
        let e_value = entry[1]; //action object
        //internal
        check(e_value.action, 'mustExists', 'string');
        check(e_value.value, 'ifExists', 'string');

        // check: if has name
        if(e_value.value) {
          //get prefixed name
          let img_name = Utils.buildImageName(emap['_id'].toString(), e_value.value);
          /**
           * These lists will include only named entries in the map,
           * e.i. only entries with @value and the files represented
           * by these lists (except for #nones, that will be moved
           * but not deleted) will be preserved by this cleaner.
           */
          //set#
          if(e_value.action === 'keep') this.#keeps.push(img_name);
          if(e_value.action === 'delete') this.#deletes.push(img_name);
          if(e_value.action === 'none') this.#nones.push(img_name);
        }
      }
    }
  }

  /**
   * run  runs the image cleaning process.
   */
  async run() {
    /**
     * Check: required values
     */
    if(!this.#map) throw new Error('map attribute is not set, could not run');
    if(!this.#path) throw new Error('path attribute is not set, could not run');
    if(!this.#cleanedPath) throw new Error('cleanedPath attribute is not set, could not run');
    
    //init
    this.#isRunning = true;
    this.#wasRan = false;
    this.#resetCounters();

    //get files in #path
    let files = Utils.getDirEntries(this.#path, {filesOnly: true});
    //internal
    check(files, 'mustExists', 'array');

    //set#
    this.#totalActions = Math.max( 0, (files.length - (this.#keeps.length + this.#deletes.length)) );
        
    /**
     * Clean process:
     *  for each file in #path, checks if it is in #keeps
     *  or in #deletes, and if not: clean it (mv or rm).
     *  Any entry in #nones will be moved to #cleanedPath.
     */
    for(let i=0; i<files.length; i++) {
      let file = files[i];
      
      //check: if file is not in #keeps or #deletes
      if(!this.#keeps.includes(file) && !this.#deletes.includes(file)) {

        //case: delete
        if(this.#deleteImages) {
          let _file = resolve(join(this.#path, file)); 

          let _error = null;
          try {
            Utils.deletePath(_file);
          } catch (error) {
            _error = error;
          }

          //prepare result:
          let op = {
            op: "clean",
            status: !_error ? 'ok': 'error',
            targetFile: file,
            targetFilePath: _file,
            newFilePath: null,
            detail: !_error ? 'file deleted' : _error.message,
            error: _error
          };
          if(!_error) delete op.error;

          //set#
          this.#cleaned.push(op);
          this.#totalActionsExecuted++;

          continue;
        }//end: case: delete 
        else { //case: mv
          let _file = resolve(join(this.#path, file));
          let _newFile = Utils.renameIfExists(resolve(join(this.#cleanedPath, file)));

          let _error = null;
          try {
            Utils.mvFile(_file, _newFile);            
          } catch (error) {
            _error = error;
          }

          //prepare result:
          let op = {
            op: "clean",
            status: !_error ? 'ok': 'error',
            targetFile: file,
            targetFilePath: _file,
            newFilePath: _newFile,
            detail: !_error ? 'file moved' : _error.message,
            error: _error
          };
          if(!_error) delete op.error;

          //set#
          this.#cleaned.push(op);
          this.#totalActionsExecuted++;

          continue;
        }//end: case: mv
      }//end: check: if file is not in #keeps or #deletes
      else {
        /**
         * Case: file in #nones
         *  will be moved to cleanedPath
         */
        if(this.#nones.includes(file)) {
          let _file = resolve(join(this.#path, file));
          let _newFile = Utils.renameIfExists(resolve(join(this.#cleanedPath, file)));

          let _error = null;
          try {
            Utils.mvFile(_file, _newFile);            
          } catch (error) {
            _error = error;
          }

          //prepare result:
          let op = {
            op: "clean",
            status: !_error ? 'ok': 'error',
            targetFile: file,
            targetFilePath: _file,
            newFilePath: _newFile,
            detail: !_error ? 'file moved' : _error.message,
            error: _error
          };
          if(!_error) delete op.error;

          //set#
          this.#cleaned.push(op);
          this.#totalActionsExecuted++;

          continue;
        }
      }
    }//end: for each file (clean process)

    //set#
    this.#isRunning = false;
    this.#wasRan = true;

    //prepare result
    let counters = {
      totalActions: this.totalActions,
      totalActionsExecuted: this.totalActionsExecuted,
      cleaned: this.cleaned,
      errors: this.errors,
    }

    return counters;
  }//end: run()

  /**
   * showProgress  shows the current cleaning process progress.
   */
  async showProgress() {
    const bar = new ProgressBar('  [:bar] ' + colors.cyan.dim.bold('cleaning: ') + colors.white(':percent ') + ':msg', {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: this.#totalActions,
      clear: false
    });

    /**
     * Case: still not ran
     */
    if(!this.#isRunning && !this.#wasRan) {
      bar.tick({
        'msg': colors.yellow.dim("not started"),
      });
    } else if(!this.#isRunning && this.#wasRan) {
      /**
       * Case: completed
       */
      bar.tick({
        'msg': colors.green.dim("images clean process completed"),
      });
      //update progress: complete
      while(!bar.complete) bar.tick(1);
    } else if(this.#isRunning) {
      /**
       * Case: running
       */
      //update progress: complete
      while(this.#isRunning) {
        //delay
        await new Promise(resolve => {
          setTimeout(function() {
            resolve("ok");
          }, 1000);
        });
        bar.total = this.#totalActionsExecuted;
        bar.update();
      }
      bar.update({
        'msg': colors.green.dim("images clean process completed"),
      });
    }

    //delay
    await new Promise(resolve => {
      setTimeout(function() {
        resolve("ok");
      }, 1000);
    });
    return;
  }

  /**
   * showReport  prints and writes to runLogFile the run report
   * corresponding to the current state of the cleaning process. 
   */
  showReport() {
    let status = '';
    /**
     * Case: still not ran
     */
    if(!this.#isRunning && !this.#wasRan) status = colors.yellow('not started');
    /**
     * Case: completed
     */
    if(!this.#isRunning && this.#wasRan) status = colors.cyan('ok');
    /**
     * Case: running
     */
    if(this.#isRunning) status = colors.green('running');
    
    //prepare report
    let imageCleanerCounters = {cleaned: this.#cleaned.length,  errors: this.#errors.length, totalActions: this.#totalActions, totalActionsExecuted: this.#totalActionsExecuted}
    if(!this.#errors.length) delete imageCleanerCounters.errors;
    
    //report
    if(!this.#runLogPath) {
      process.stdout.write(`\n`);
      process.stdout.write('  ' + '['+ status + ']' + colors.cyan.dim.bold('image-cleaning' + ': '));
      //print counters
      let e = Object.entries(imageCleanerCounters);
      for(let j=0; j<e.length; j++) {
        if(j === 0) process.stdout.write('  ');
        //key
        process.stdout.write(`${colors.white(e[j][0])}: `);
        //value
        if(e[j][0] === 'errors') process.stdout.write(`${colors.red.bold(e[j][1])}`);
        else process.stdout.write(`${colors.brightWhite.bold(e[j][1])}`);
        if(j+1 < e.length) process.stdout.write(', ');
      }
      process.stdout.write('\n');
    } else {
      Utils.log(this.#runLogPath, `[${status}]${colors.cyan.dim.bold('image-cleaning' + ': ')}`, {onNewLine:true, noNewLine:true});
      Utils.printReportCounters([{counters: imageCleanerCounters}], this.#runLogPath, {noTimestamp:true});
    }
    return;
  }
}//end: class ImageCleaner

export { ImageCleaner };
