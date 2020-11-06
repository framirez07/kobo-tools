import { applyFilters, get } from './utils.js';
import { check } from './checks.js';
import axios from 'axios';
import colors from 'colors/safe.js';
import ProgressBar from 'progress';

/**
 * getAssets  get assets info from @endpoint /assets/.
 * 
 * @param {object} options operation options. 
 */
export async function getAssets(options) {
  //internal
  check(options, 'mustExists', 'object');
  check(options.apiServerUrl, 'mustExists', 'string');
  check(options.maxRequestRetries, 'defined', 'number');
  check(options.requestTimeout, 'defined', 'number');
  check(options.connectionTimeout, 'defined', 'number');

  //endpoint
  let next = `${options.apiServerUrl}/assets/?limit=1&offset=0`;
  let results = [];

  //progress
  let bar = new ProgressBar('  [:bar] ' + colors.dim(next) + colors.white('  :percent '), {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: 100 //will be updated with res.data.count
  });

  //counters
  let assetsCount = 0;
  let assetsFetched = 0;
  let assetsFiltered = 0;
  let totalResults = 0;

  /**
   * Cycle: get assets
   */
  while(next) {
    //init
    let response = null;
    let done=false;
    let retries = 1;
    bar.fmt = '  [:bar] ' + colors.dim(next) + colors.white('  :percent ');
    
    //request cycle
    while(!done && retries<=options.maxRequestRetries && !response) {
      //request options
      let CancelToken = axios.CancelToken;
      let source = CancelToken.source();
      
      //headers
      let headers = {};
        //header: auth token
        if(options.token) headers['Authorization'] = `Token ${options.token}`;

      let req_options = {
        headers,
        timeout: options.requestTimeout,
        cancelToken: source.token
      };
      
      //cancelation timeout
      let timeout = setTimeout(() => {
        source.cancel(`connection timeout of ${options.connectionTimeout}ms exceeded`);
      }, options.connectionTimeout);

      //request
      response = await axios.get(next, req_options)
      .then(
        //resolved
        (response) => {
          //internal
          check(response, 'mustExists', 'object');
          check(response.data, 'mustExists', 'object');
          check(response.data.next, 'ifExists', 'string');
          check(response.data.count, 'defined', 'number');
          check(response.data.results, 'mustExists', 'array');
                    
          //ok
          return response;
        },
        //rejected
        (error) => { throw error })
      .catch((error) => {
        //msg
        process.stdout.write("  " + colors.grey(error.message) + "\n");
        console.log(colors.dim('    resquest failed on try:'), retries, "/", options.maxRequestRetries);
        retries++;
      });
      //clear
      clearTimeout(timeout);
    }//end: while: request cycle
    //check: max retries reached
    if(!response) {
      /**
       * Report
       */
      let status = false;
      let report = [];
      assetsFiltered = assetsFetched - results.length;
      totalResults = results.length;
      let o = {
        apiOp: 'getAssets',
        status: 'failed',
        detail: `max retries of ${options.maxRequestRetries} reached at endpoint: ${next}`,
        assetsCount,
        assetsFetched,
        assetsFiltered,
        totalResults,
      };
      report.push(o);
      return {results, report, status};
    }
    //update counters
    assetsCount = Math.max(assetsCount, response.data.count);
    assetsFetched += response.data.results.length;

    //update progress
    bar.total = response.data.count;
    bar.tick(1);
    
    //update endpoint
    next = response.data.next;

    /**
     * -------------
     * Apply filters
     * -------------
     */
    let filtered_result = [];
    if(options.resFilters && typeof options.resFilters === 'object') {
      filtered_result = await applyFilters(options.resFilters, response.data.results);
    } else {
      filtered_result = [...response.data.results];
    }
    //join results
    results = [...results, ...filtered_result];

  }//end: while(next)

  /**
   * Report
   */
  let status = true;
  let report = [];
  assetsFiltered = assetsFetched - results.length;
  totalResults = results.length;
  let o = {
    apiOp: 'getAssets',
    status: 'complete',
    detail: `all assets fetched`,
    assetsCount,
    assetsFetched,
    assetsFiltered,
    totalResults,
  };
  report.push(o);

  return {results, report, status};
}

/**
 * getAssetInfo  get an asset info from @endpoint /assets/{uid}.
 * 
 * @param {string} uid asset uid.
 * @param {object} options field selection options. 
 */
export async function getAssetInfo(uid, options) {
  //check
  if(!options.apiServerUrl || typeof options.apiServerUrl !== 'string') throw new Error('expected string in @URL');
  if(!uid||typeof uid !== 'string') return null;
  //endpoint
  let next = `${options.apiServerUrl}/assets/${uid}`;
  let results = [];

  //msg
  process.stdout.write("@@ next: " + next);

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=options.maxRequestRetries && !result) {

    //request options
    let CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    let options = {
      headers: {'Authorization': `Token ${options.token}`}, 
      timeout: options.requestTimeout,
      cancelToken: source.token
    };

    //cancelation timeout
    let timeout = setTimeout(() => {
      source.cancel(`connection timeout of ${options.connectionTimeout}ms exceeded`);
    }, options.connectionTimeout);

    result = await axios.get(next, options)
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
    .catch((error) => {
      //msg
      if(retries===1) process.stdout.write("\n");
      console.log("@@try:", retries, "/", options.maxRequestRetries, " - error: ", error.message);
      //add
      retries++;
    });
    //clear
    clearTimeout(timeout);

  }//end: while
  //check
  if(result===null||result===undefined) return null;
  if(typeof result !== 'object') return null;

  /**
   * -------------
   * Apply filters
   * -------------
   */
  let filtered_result = [];

  if(options&&typeof options === 'object'&& options.filters&&typeof options.filters === 'object') {
    filtered_result = await applyFilters(options.filters, [result]);
  } else {
    filtered_result = [result];
  }
  //join results
  results = [...filtered_result];
  
  return results;
}


/**
 * getSubmissions  get the submissions of the
 * given assets with @uid.
 * 
 * @param {string} uid asset uid.
 * @param {object} options field selection options. 
 */
export async function getSubmissions(uid, options) {
  //check
  if(!options.apiServerUrl || typeof options.apiServerUrl !== 'string') throw new Error('expected string in @URL');
  if(!uid||typeof uid !== 'string') return null;
  //endpoint
  let next = `${options.apiServerUrl}/assets/${uid}/submissions/`;

  //msg
  process.stdout.write("@@ next: " + next);

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=options.maxRequestRetries && !result) {
    result = await get(next).catch((error) => {
      //msg
      if(retries===1) process.stdout.write("\n");
      console.log("@@ try:", retries, "/", options.maxRequestRetries, " - error: ", error.message);
      //add
      retries++;
    });
  }//end: while
  //check
  if(result===null||result===undefined) return null;
  if(!Array.isArray(result)) return null;

  /**
   * -------------
   * Apply filters
   * -------------
   */
  let filtered_result = [];
  if(options&&typeof options === 'object'
  && options.filters&&typeof options.filters === 'object') {
    filtered_result = await applyFilters(options.filters, result);
  } else { filtered_result = result; }

  return [...filtered_result];
}

/**
 * download  downloads a file from @url and return the read stream and
 * content length.
 * 
 * @param {string} url download url.
 * @param {object} options 
 */
export async function download(url, options) {
  //check
  if(!options.mediaServerUrl || typeof options.mediaServerUrl !== 'string') throw new Error('expected string in @MEDIA_URL');
  if(!url || typeof url !== 'string') throw new Error('expected string in @url');
  if(options && typeof options !== 'object') throw new Error('expected object in @options');

  //options
  let noMessages = (options&&options.noMessages) ? options.noMessages : false; 
  
  //endpoint
  let next = `${options.mediaServerUrl}/${url}`;

  //msg
  if(!noMessages) console.log(colors.bold.brightBlue('  next: ') + colors.dim(next));

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=options.maxRequestRetries && !result) {

    //request options
    let CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    let options = {
      headers: {'Authorization': `Token ${options.token}`, 'Connection': 'keep-alive'},
      responseType: 'stream',
      timeout: options.requestTimeout,
      cancelToken: source.token
    };

    //cancelation timeout
    let timeout = setTimeout(() => {
      source.cancel(`connection timeout of ${options.connectionTimeout}ms exceeded`);
    }, options.connectionTimeout);

    result = await axios.get(next, options)
    .then(
      //resolved
      (response) => {
        //check
        if(!response||!response.data){done = true; throw new Error('no response data')};
        
        //ok
        return response;
      },
      //rejected
      (error) => {
        //msg
        console.log(colors.dim('    resquest failed on try:'), retries, "/", options.maxRequestRetries, " - error: ", colors.green(error.message));
        //add
        retries++;
      })
    .catch((error) => {
      //msg
      console.log(colors.dim('    resquest failed on try:'), retries, "/", options.maxRequestRetries, " - error: ", colors.green(error.message));
      //add
      retries++;
    });
    //clear
    clearTimeout(timeout);

  }//end: while
  //check
  if(result===null||result===undefined) return null;
  if(typeof result !== 'object') return null;
  if(!result.headers || typeof result.headers !== 'object') return null;
  if(!result.headers['content-length'] || typeof result.headers['content-length'] !== 'string') return null;

  return [{readStream: result.data, contentLength: parseInt(result.headers['content-length'])}];
}