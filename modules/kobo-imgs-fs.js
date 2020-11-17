import * as Utils from './utils.js';
import { check } from './checks.js';
import { download } from './kobo-api.js';
import path from 'path';
import fs from 'fs-extra';
import colors from 'colors/safe.js';
import ProgressBar from 'progress';

/**
 * writeStream  writes @readStream to a file.
 * 
 * @param {string} dir_path dir path to which write the downloaded file on.
 * @param {string} file_name name of the file that will be write.
 * @param {object} readStream read stream.
 * @param {number} contentLength length of read stream.
 */
export async function writeStream(dir_path, file_name, readStream, contentLength, options) {
  //internal
  check(dir_path, 'mustExists', 'string');
  check(file_name, 'mustExists', 'string');
  check(readStream, 'mustExists', 'object');
  check(contentLength, 'defined', 'number');
  check(options, 'mustExists', 'object');
  check(options.downloadTimeout, 'defined', 'number');
  check(options.step_log_path, 'mustExists', 'string');
  check(options.runLogPath, 'mustExists', 'string');
  
  Utils.makeDirPath(dir_path);
  let _file_path = path.resolve(path.join(dir_path, file_name));
  let bytesRead = 0;

  const writer = fs.createWriteStream(_file_path);
  const bar = new ProgressBar('  downloading [:bar] ' + colors.white(':percent ') + colors.grey(file_name), {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: contentLength,
    clear: true
  });

  let _result = await new Promise((resolve, reject) => {
    //timer
    let timeout = setTimeout(() => {
      //close reader
      readStream.destroy();
      //reject
      reject(new Error(`download timeout of ${options.downloadTimeout}ms exceeded`));
    }, options.downloadTimeout);

    //writer event listeners
    writer.on('finish', function () {
      clearTimeout(timeout);
      let result = { contentLength, bytesRead, bytesWritten: writer.bytesWritten, file_path: _file_path, file_name, status: 'completed' };
      //close reader
      readStream.destroy();
      resolve(result);
    });
    writer.on('error', function (error) {
      clearTimeout(timeout);
      //close reader
      readStream.destroy();
      //reject
      reject(error);
    });

    //reader event listeners
    readStream.on('data', function (chunk) {
      //restart timer
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        //close reader
        readStream.destroy();
        //reject
        reject(new Error(`download timeout of ${options.downloadTimeout}ms exceeded`));
      }, options.downloadTimeout);

      bytesRead += chunk.length;
      bar.tick(chunk.length);
    });
  
    readStream.on('error', function (error) {
      writer.end();
      //reject
      reject(error);
    });
  
    readStream.on('close', function () {
      writer.end();
    });

    readStream.pipe(writer);
  }).catch(error => {throw error});

  return [_result];
}

/**
 * saveImage  download and save @readStream to a file.
 * 
 * @param {string} i_url image download url.
 * @param {string} i_path path to which save on the downloaded image.
 * @param {string} e_name name of the image that will be saved.
 */
export async function saveImage(i_url, i_path, i_name, options) {
  //internal
  check(i_url, 'mustExists', 'string');
  check(i_path, 'mustExists', 'string');
  check(i_name, 'mustExists', 'string');
  check(options, 'mustExists', 'object');
  check(options.maxDownloadRetries, 'defined', 'number');
  check(options.step_log_path, 'mustExists', 'string');
  check(options.runLogPath, 'mustExists', 'string');
  
  //init
  let result = null;
  let done=false;
  let retries = 1;

  //download & write cycle
  while(!done && retries<=options.maxDownloadRetries && !result) {
    try {
      /**
       * download
       */
      let d_results = await download(i_url, options);
      //internal
      check(d_results, 'ifExists', 'array');
      //case: no results
      if(!d_results) throw new Error(`download could not be started at url: ${i_url}`);
      if(d_results.length===0) throw new Error(`download operation has no results`);
      
      //get result
      let d_result = d_results[0];
      //internal
      check(d_result, 'mustExists', 'object');
      check(d_result.readStream, 'mustExists', 'object');
      check(d_result.contentLength, 'ifExists', 'number');
      check(d_result.contentType, 'ifExists', 'string');
      //case: no content
      if(!d_result.contentLength) throw new Error(`download has not content-length: ${i_url}`)
      
      /**
       * write
       */
      let w_results = await writeStream(i_path, i_name, d_result.readStream, d_result.contentLength, options);
      //internal
      check(w_results, 'ifExists', 'array');
      //case: no results
      if(!w_results) throw new Error(`write operation failed on file: ${i_name}`);
      if(w_results.length===0) throw new Error(`writeStream operation has no results`);
      
      //get result
      let w_result = w_results[0];
      //internal
      check(w_result, 'mustExists', 'object');
      check(w_result.contentLength, 'defined', 'number');
      check(w_result.bytesRead, 'defined', 'number');

      //check
      if(w_result.bytesRead !== w_result.contentLength){
        throw new Error('incomplete download');
      } else {
        //prepare result
        result = {...w_result, contentType: d_result.contentType};
      }
    } catch(error) {
      //log
      Utils.log(options.runLogPath, colors.grey(error.message));
      Utils.log(options.runLogPath, `${colors.grey('download failed on try:')} ${colors.yellow.dim(retries)}${colors.white.dim("/")}${colors.yellow.dim(options.maxDownloadRetries)}`);
      retries++;
    }
  }//end: download & write cycle
  //check: fails after max retries
  if(!result) throw new Error(`saveImage fails after ${options.maxDownloadRetries} retries`);

  //log
  Utils.log(options.runLogPath, '100%', {logOnly:true});

  return result;
}
