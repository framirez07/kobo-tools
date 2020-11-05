import configs from './configs.js';
import { makeDirPath, deletePath, writeFile } from './utils.js';
import { download } from './kobo-api-requests.js';
import path from 'path';
import fs from 'fs-extra';
import colors from 'colors/safe.js';
import ProgressBar from 'progress';

//global configs
const _max_retries = configs.DOWNLOAD_RETRIES || 30;
const _req_timeout = configs.REQUEST_TIMEOUT || 15000;
const _download_timeout = _req_timeout+3000;

/**
 * writeStream  writes @readStream to a file.
 * 
 * @param {string} dir_path dir path to which write the downloaded file on.
 * @param {string} file_name name of the file that will be write.
 * @param {object} readStream read stream.
 * @param {number} contentLength length of read stream.
 */
export async function writeStream(dir_path, file_name, readStream, contentLength) {
  //check
  if(!dir_path || typeof dir_path !== 'string') throw new Error('expected string in @dir_path');
  if(!file_name || typeof file_name !== 'string') throw new Error('expected string in @file_name');
  if(!readStream || typeof readStream !== 'object') throw new Error('expected object in @readStream');
  if(typeof contentLength !== 'number') throw new Error('expected number in @contentLength');
  
  makeDirPath(dir_path);
  let _file_path = path.resolve(path.join(dir_path, file_name));
  let bytesRead = 0;

  const writer = fs.createWriteStream(_file_path);
  const bar = new ProgressBar('  downloading [:bar] ' + colors.dim(':rate/bps ') + colors.white(':percent '), {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: contentLength
  });

  let _result = await new Promise((resolve, reject) => {
    //timer
    let timeout = setTimeout(() => {
      //msg
      process.stdout.write(colors.grey(`  -  download timeout of ${_download_timeout}ms exceeded`));
      //close reader
      readStream.destroy();
    }, _download_timeout);

    //writer event listeners
    writer.on('finish', function () {
      clearTimeout(timeout);
      let result = { contentLength, bytesRead, bytesWritten: writer.bytesWritten, file_path: _file_path, file_name, status: 'completed' };
      resolve(result);
    });
    writer.on('error', function () {
      clearTimeout(timeout);
      let result = { contentLength, bytesRead, bytesWritten: writer.bytesWritten, file_path: _file_path, file_name, status: 'error' };
      reject(result);
    });

    //reader event listeners
    readStream.on('data', function (chunk) {
      //restart timer
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        //msg
        process.stdout.write(colors.grey(`  -  download timeout of ${_download_timeout}ms exceeded`));
        //close reader
        readStream.destroy();
      }, _download_timeout);

      bytesRead += chunk.length;
      bar.tick(chunk.length);
    });
  
    readStream.on('error', function (error) {
      writer.end();
    });
  
    readStream.on('close', function () {
      writer.end();
    });

    readStream.pipe(writer);
  });

  return [_result];
}

/**
 * saveImage  download and save @readStream to a file.
 * 
 * @param {string} i_url image download url.
 * @param {string} i_path path to which save on the downloaded image.
 * @param {string} e_name name of the image that will be saved.
 */
export async function saveImage(i_url, i_path, i_name) {
  //check
  if(!i_url || typeof i_url !== 'string') throw new Error('expected string in @i_url');
  if(!i_path || typeof i_path !== 'string') throw new Error('expected string in @i_path');
  if(!i_name || typeof i_name !== 'string') throw new Error('expected string in @i_name');
  
  //init
  let result = null;
  let done=false;
  let retries = 1;

  //download & write cycle
  while(!done && retries<=_max_retries && !result) {
    /**
     * download
     */
    let d_results = await download(i_url, {noMessages: (retries > 1)});
    //internal check
    if(!d_results) throw new Error(`download could not be started at url: ${i_url}`);
    if(!Array.isArray(d_results)) throw new Error(`expected array in @results: ${d_results}`); //convention
    if(d_results.length !== 1) throw new Error(`expected exactly one result in download array @results: ${d_results}`); //convention
    
    //get download result
    let d_result = d_results[0];
    //internal check
    if(!d_result || typeof d_result !== 'object') throw new Error('expected object in download @d_result');
    if(!d_result.readStream || typeof d_result.readStream !== 'object') throw new Error('expected object in @readStream');
    if(typeof d_result.contentLength !== 'number') throw new Error('expected number in @contentLength');
    
    /**
     * write
     */
    let w_results = await writeStream(i_path, i_name, d_result.readStream, d_result.contentLength);
    //internl check
    if(!w_results) throw new Error(`write operation failed on file: ${i_name}`);
    if(!Array.isArray(w_results)) throw new Error(`expected array in @results: ${w_results}`); //convention
    if(w_results.length !== 1) throw new Error(`expected exactly one result in writeStream array @results: ${w_results}`); //convention
    
    //get write result
    let w_result = w_results[0];
    //internal check
    if(!w_result || typeof w_result !== 'object') throw new Error('expected object in download @w_result');
    if(typeof w_result.contentLength !== 'number') throw new Error('expected number in @contentLength');
    if(typeof w_result.bytesRead !== 'number') throw new Error('expected number in @bytesRead');
    if(typeof w_result.bytesWritten !== 'number') throw new Error('expected number in @bytesWritten');

    //check
    if(w_result.bytesRead !== w_result.contentLength){
      //msg
      console.log(colors.dim('\n    download failed on try:'), retries, "/", _max_retries, " - error: ", colors.green('incomplete download'));
      //add
      retries++;
    } else {
      result = w_result;
    }
  }//end: download & write cycle

  //check
  if(!result) throw new Error('image could not be downloaded from:' + i_url);
  //internal check
  if(typeof result !== 'object') throw new Error('expected object in @result');

  return result;
}

/**
 * writeLog  write operation results to logfile in JSON format.
 * 
 * @param {string} l_path path to which save on the log.
 * @param {string} l_name name of the log that will be saved.
 * @param {object} l_content object with the log content.
 */
export async function writeLog(l_path, l_name, l_content) {
  //internal check
  if(!l_path || typeof l_path !== 'string') throw new Error('expected string in @l_path');
  if(!l_name || typeof l_name !== 'string') throw new Error('expected string in @l_name');
  if(!l_content || typeof l_content !== 'object') throw new Error('expected object in @l_content');

  makeDirPath(l_path);
  let _file_path = path.resolve(path.join(l_path, l_name));
  let _result = writeFile(_file_path, JSON.stringify(l_content));

  let result = {file_path: _file_path, file_name: _result, status: 'completed'};
  
  return result;
}


/**
 * readLog  read logfile.
 * 
 * @param {string} l_path path in which the logfile is.
 * @param {string} l_name name of the log that will be read.
 * @return {object} object with the log content.
 */
export async function readLog(l_path, l_name) {
  //internal check
  if(!l_path || typeof l_path !== 'string') throw new Error('expected string in @l_path');
  if(!l_name || typeof l_name !== 'string') throw new Error('expected string in @l_name');

  let _file_path = path.resolve(path.join(l_path, l_name));
  let result = parseJSONFile(_file_path);
  
  return result;
}