import request from '../utils/request'

export function loginApi(data: any): Promise<any> {
  return request({
    url: '/api/login',
    method: 'post',
    data
  })
}
