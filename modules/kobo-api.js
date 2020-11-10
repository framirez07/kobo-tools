import { applyFilters, get } from './utils.js';
import { check } from './checks.js';
import axios from 'axios';
import colors from 'colors/safe.js';
import ProgressBar from 'progress';

const nextColor = colors.grey;
const retryMsgColor = colors.grey;

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
  let bar = new ProgressBar('  [:bar] ' + nextColor(next) + colors.white('  :percent '), {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: 100 //will be updated with res.data.count
  });
  bar.tick(0);

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
    bar.fmt = '  [:bar] ' + nextColor(next) + colors.white('  :percent ');
    
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
        console.log(retryMsgColor('    resquest failed on try:'), retries, "/", options.maxRequestRetries);
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
        counters: {
          assetsCount,
          assetsFetched,
          assetsFiltered,
          totalResults
        }
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
    detail: `assets fetched`,
    counters: {
      assetsCount,
      assetsFetched,
      assetsFiltered,
      totalResults
    }
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
  //internal
  check(uid, 'mustExists', 'string');
  check(options, 'mustExists', 'object');
  check(options.apiServerUrl, 'mustExists', 'string');
  check(options.maxRequestRetries, 'defined', 'number');
  check(options.requestTimeout, 'defined', 'number');
  check(options.connectionTimeout, 'defined', 'number');

  //endpoint
  let next = `${options.apiServerUrl}/assets/${uid}`;
  let results = [];

  //progress
  let bar = new ProgressBar('  [:bar] ' + nextColor(next) + colors.white('  :percent '), {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: options.connectionTimeout*2/1000 //virtual
  });
  bar.tick(0);
  
  //counters
  let assetsCount = 1;
  let assetsFetched = 0;
  let assetsFiltered = 0;
  let totalResults = 0;

  //init
  let response = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=options.maxRequestRetries && !response) {
    //tick interval (virtual progress)
    let tickinterval = setInterval(() => {if((bar.curr/bar.total) < .8) bar.tick(1);}, 300);

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
                  
        //ok
        return response;
      },
      //rejected
      (error) => { throw error })
    .catch((error) => {
      //msg
      process.stdout.write("  " + colors.grey(error.message) + "\n");
      console.log(retryMsgColor('    resquest failed on try:'), retries, "/", options.maxRequestRetries);
      retries++;
    });
    //clear
    clearTimeout(timeout);
    clearInterval(tickinterval);

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
      apiOp: 'getAssetInfo',
      status: 'failed',
      detail: `max retries of ${options.maxRequestRetries} reached at endpoint: ${next}`,
      counters: {
        assetsCount,
        assetsFetched,
        assetsFiltered,
        totalResults
      }
    };
    report.push(o);
    return {results, report, status};
  }
  //update counters
  assetsFetched++;

  //update progress: complete
  while(!bar.complete) bar.tick(1);

  /**
   * -------------
   * Apply filters
   * -------------
   */
  let filtered_result = [];
  if(options.resFilters && typeof options.resFilters === 'object') {
    filtered_result = await applyFilters(options.resFilters, [response.data]);
  } else {
    filtered_result = [response.data];
  }
  //join results
  results = [...results, ...filtered_result];

  /**
   * Report
   */
  let status = true;
  let report = [];
  assetsFiltered = assetsFetched - results.length;
  totalResults = results.length;
  let o = {
    apiOp: 'getAssetInfo',
    status: 'complete',
    detail: `asset fetched`,
    counters: {
      assetsCount,
      assetsFetched,
      assetsFiltered,
      totalResults
    }
  };
  report.push(o);

  return {results, report, status};
}


/**
 * getSubmissions  get the submissions of the
 * given assets with @uid.
 * 
 * @param {string} uid asset uid.
 * @param {object} options field selection options. 
 */
export async function getSubmissions(uid, options) {
  //internal
  check(uid, 'mustExists', 'string');
  check(options, 'mustExists', 'object');
  check(options.apiServerUrl, 'mustExists', 'string');
  check(options.maxRequestRetries, 'defined', 'number');
  check(options.requestTimeout, 'defined', 'number');
  check(options.connectionTimeout, 'defined', 'number');

  //endpoint
  let next = `${options.apiServerUrl}/assets/${uid}/submissions/`;
  let results = [];

  //progress
  let bar = new ProgressBar('  [:bar] ' + nextColor(next) + colors.white('  :percent '), {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: options.connectionTimeout*2/1000 //virtual
  });
  bar.tick(0);

  //counters
  let assetsCount = 1;
  let assetsFetched = 0;
  let assetsFiltered = 0;
  let totalResults = 0;

  //init
  let response = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=options.maxRequestRetries && !response) {
    //tick interval (virtual progress)
    let tickinterval = setInterval(() => {if((bar.curr/bar.total) < .8) bar.tick(1);}, 300);

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
        check(response.data, 'mustExists', 'array');
                  
        //ok
        return response;
      },
      //rejected
      (error) => { throw error })
    .catch((error) => {
      //msg
      process.stdout.write("  " + colors.grey(error.message) + "\n");
      console.log(retryMsgColor('    resquest failed on try:'), retries, "/", options.maxRequestRetries);
      retries++;
    });
    //clear
    clearTimeout(timeout);
    clearInterval(tickinterval);
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
      apiOp: 'getSubmissions',
      status: 'failed',
      detail: `max retries of ${options.maxRequestRetries} reached at endpoint: ${next}`,
      counters: {
        assetsCount,
        assetsFetched,
        assetsFiltered,
        totalResults
      }
    };
    report.push(o);
    return {results, report, status};
  }
  //update counters
  assetsFetched++;

  //update progress: complete
  while(!bar.complete) bar.tick(1);


  /**
   * -------------
   * Apply filters
   * -------------
   */
  let filtered_result = [];
  if(options.resFilters && typeof options.resFilters === 'object') {
    filtered_result = await applyFilters(options.resFilters, response.data);
  } else {
    filtered_result = [...response.data];
  }
  //join results
  results = [...results, ...filtered_result];

  /**
   * Report
   */
  let status = true;
  let report = [];
  assetsFiltered = assetsFetched - results.length;
  totalResults = results.length;
  let o = {
    apiOp: 'getSubmissions',
    status: 'complete',
    detail: `asset fetched`,
    counters: {
      assetsCount,
      assetsFetched,
      assetsFiltered,
      totalResults
    }
  };
  report.push(o);

  return {results, report, status};
}

/**
 * download  downloads a file from @url and return the read stream and
 * content length.
 * 
 * @param {string} url download url.
 * @param {object} options 
 */
export async function download(url, options) {
  //internal
  check(url, 'mustExists', 'string');
  check(options, 'mustExists', 'object');
  check(options.mediaServerUrl, 'mustExists', 'string');
  check(options.maxRequestRetries, 'defined', 'number');
  check(options.requestTimeout, 'defined', 'number');
  check(options.connectionTimeout, 'defined', 'number');

  //options
  let noMessages = (options&&options.noMessages) ? options.noMessages : false; 
  
  //endpoint
  let next = `${options.mediaServerUrl}/${url}`;

  //msg
  if(!noMessages) console.log(colors.bold.brightBlue('  next: ') + nextColor(next));

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=options.maxRequestRetries && !result) {
    //request options
    let CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    
    //headers
    let headers = {
      'Connection': 'keep-alive'
    };
      //header: auth token
      if(options.token) headers['Authorization'] = `Token ${options.token}`;

    let req_options = {
      headers,
      timeout: options.requestTimeout,
      cancelToken: source.token,
      responseType: 'stream',
    };
    
    //cancelation timeout
    let timeout = setTimeout(() => {
      source.cancel(`connection timeout of ${options.connectionTimeout}ms exceeded`);
    }, options.connectionTimeout);

    //request    
    result = await axios.get(next, req_options)
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
        console.log(retryMsgColor('    resquest failed on try:'), retries, "/", options.maxRequestRetries, " - error: ", colors.green(error.message));
        //add
        retries++;
      })
    .catch((error) => {
      //msg
      console.log(retryMsgColor('    resquest failed on try:'), retries, "/", options.maxRequestRetries, " - error: ", colors.green(error.message));
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