export default {
  /**
   * Token got with:
   * https://kobo.conabio.gob.mx/token/?format=json
   * 
   * Needed to authenticate kobo-api requests.
   */
  TOKEN: 'd3585b44a3ada6416be99818d4b4f4c0f2c7077f',
  USER: 'framirez', 
  // KoBo api server
  URL: 'https://kobo.conabio.gob.mx/',
  // KoBo media server
  MEDIA_URL: 'https://kcat.conabio.gob.mx/',
  // Requests configs
  REQUEST_TIMEOUT: 15000, //15s
  REQUEST_RETRIES: 20,
  DOWNLOAD_RETRIES: 30,
  
  /**
   * @TARGET_DIR  directory where the updates will be made; if no
   * defined or invalid, a new directory in the current working 
   * directory will be created with name 'out_timestamp'.
   */
  TARGET_DIR: '_out',
}
