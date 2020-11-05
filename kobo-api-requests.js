import configs from './configs.js';
import { applyFilters, get } from './utils.js';
import axios from 'axios';
import colors from 'colors/safe.js';

//global configs
const _api_server = configs.URL || "";
const _media_server = configs.MEDIA_URL || "";
const _token = configs.TOKEN || "";
const _max_retries = configs.REQUEST_RETRIES || 20;
const _req_timeout = configs.REQUEST_TIMEOUT || 15000;
const _con_timeout = _req_timeout+3000;
const _download_timeout = _req_timeout+3000;

/**
 * getAssets  get assets info from @endpoint /assets/.
 * 
 * @param {object} options filter options. 
 */
export async function getAssets(options) {
  //check
  if(!_api_server || typeof _api_server !== 'string') throw new Error('expected string in @URL');

  //endpoint
  let next = `${_api_server}/assets/?limit=1&offset=0`;
  let results = [];

  while(next) {
    //msg
    process.stdout.write("@@ next: " + next);

    //init
    let result = null;
    let done=false;
    let retries = 1;
    
    //request cycle
    while(!done && retries<=_max_retries && !result) {
      //request options
      let CancelToken = axios.CancelToken;
      let source = CancelToken.source();
      let options = {
        headers: {'Authorization': `Token ${_token}`}, 
        timeout: _req_timeout,
        cancelToken: source.token
      };
      //cancelation timeout
      let timeout = setTimeout(() => {
        source.cancel(`connection timeout of ${_con_timeout}ms exceeded`);
      }, _con_timeout);
      //request
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
        (error) => {
          //msg
          if(retries===1) process.stdout.write("\n");
          console.log("@@try:", retries, "/", _max_retries, " - error: ", error.message);
          //add
          retries++;
        })
      .catch((error) => {
        //msg
        if(retries===1) process.stdout.write("\n");
        console.log("@@try:", retries, "/", _max_retries, " - error: ", error.message);
        //add
        retries++;
      });
      //clear
      clearTimeout(timeout);

    }//end: while
    //check
    if(result===null||result===undefined) return null;
    if(typeof result !== 'object' || !Array.isArray(result.results)) return null;

    //update endpoint
    next = result.next;

    /**
     * -------------
     * Apply filters
     * -------------
     */
    let filtered_result = [];
    if(options&&typeof options === 'object'&& options.filters&&typeof options.filters === 'object') {
      filtered_result = await applyFilters(options.filters, result.results);
    } else {
      filtered_result = [...result.results];
    }
    //join results
    results = [...results, ...filtered_result];

  }//end: while(next)

  return results;
}

/**
 * getAssetInfo  get an asset info from @endpoint /assets/{uid}.
 * 
 * @param {string} uid asset uid.
 * @param {object} options field selection options. 
 */
export async function getAssetInfo(uid, options) {
  //check
  if(!_api_server || typeof _api_server !== 'string') throw new Error('expected string in @URL');
  if(!uid||typeof uid !== 'string') return null;
  //endpoint
  let next = `${_api_server}/assets/${uid}`;
  let results = [];

  //msg
  process.stdout.write("@@ next: " + next);

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=_max_retries && !result) {

    //request options
    let CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    let options = {
      headers: {'Authorization': `Token ${_token}`}, 
      timeout: _req_timeout,
      cancelToken: source.token
    };

    //cancelation timeout
    let timeout = setTimeout(() => {
      source.cancel(`connection timeout of ${_con_timeout}ms exceeded`);
    }, _con_timeout);

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
      (error) => {
        //msg
        if(retries===1) process.stdout.write("\n");
        console.log("@@try:", retries, "/", _max_retries, " - error: ", error.message);
        //add
        retries++;
      })
    .catch((error) => {
      //msg
      if(retries===1) process.stdout.write("\n");
      console.log("@@try:", retries, "/", _max_retries, " - error: ", error.message);
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
  if(!_api_server || typeof _api_server !== 'string') throw new Error('expected string in @URL');
  if(!uid||typeof uid !== 'string') return null;
  //endpoint
  let next = `${_api_server}/assets/${uid}/submissions/`;

  //msg
  process.stdout.write("@@ next: " + next);

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=_max_retries && !result) {
    result = await get(next).catch((error) => {
      //msg
      if(retries===1) process.stdout.write("\n");
      console.log("@@ try:", retries, "/", _max_retries, " - error: ", error.message);
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
  if(!_media_server || typeof _media_server !== 'string') throw new Error('expected string in @MEDIA_URL');
  if(!url || typeof url !== 'string') throw new Error('expected string in @url');
  if(options && typeof options !== 'object') throw new Error('expected object in @options');

  //options
  let noMessages = (options&&options.noMessages) ? options.noMessages : false; 
  
  //endpoint
  let next = `${_media_server}/${url}`;

  //msg
  if(!noMessages) console.log(colors.bold.brightBlue('  next: ') + colors.dim(next));

  //init
  let result = null;
  let done=false;
  let retries = 1;

  //request cycle
  while(!done && retries<=_max_retries && !result) {

    //request options
    let CancelToken = axios.CancelToken;
    let source = CancelToken.source();
    let options = {
      headers: {'Authorization': `Token ${_token}`, 'Connection': 'keep-alive'},
      responseType: 'stream',
      timeout: _req_timeout,
      cancelToken: source.token
    };

    //cancelation timeout
    let timeout = setTimeout(() => {
      source.cancel(`connection timeout of ${_con_timeout}ms exceeded`);
    }, _con_timeout);

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
        console.log(colors.dim('    resquest failed on try:'), retries, "/", _max_retries, " - error: ", colors.green(error.message));
        //add
        retries++;
      })
    .catch((error) => {
      //msg
      console.log(colors.dim('    resquest failed on try:'), retries, "/", _max_retries, " - error: ", colors.green(error.message));
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