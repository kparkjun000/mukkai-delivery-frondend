import axios from "axios";
import type { AxiosInstance, AxiosResponse, AxiosError } from "axios";

// 임시로 여기서 타입 정의
interface ApiResponse<T> {
  result: {
    resultCode: number;
    resultMessage: string;
    resultDescription: string;
  };
  body: T;
}

// 백엔드 API URL - 프로덕션에서는 프록시 사용, fallback으로 직접 호출
// Heroku 환경 또는 빌드된 환경에서는 프록시 사용
const isProduction = process.env.NODE_ENV === 'production' || 
                    typeof window !== 'undefined' && 
                    window.location.hostname.includes('herokuapp.com');

const API_BASE_URL = isProduction
  ? '' // 프로덕션에서는 프록시 사용 
  : "https://mukkai-backend-api-f9dc2d5aad02.herokuapp.com";

const FALLBACK_API_BASE_URL = "https://mukkai-backend-api-f9dc2d5aad02.herokuapp.com";

console.log('🔧 API Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  hostname: typeof window !== 'undefined' ? window.location.hostname : 'server',
  isProduction,
  API_BASE_URL,
  FALLBACK_API_BASE_URL
});

// Axios 인스턴스 생성
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15초로 단축 (빠른 fallback)
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  // CORS 설정
  withCredentials: false, // 쿠키를 포함하지 않음
});

// Fallback 인스턴스 (직접 백엔드 호출)
const fallbackAxiosInstance: AxiosInstance = axios.create({
  baseURL: FALLBACK_API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  withCredentials: false,
});

// Request Interceptor를 양쪽 인스턴스에 적용하는 함수
const addRequestInterceptor = (instance: AxiosInstance, name: string) => {
  instance.interceptors.request.use(
    (config) => {
      console.log(`🚀 [${name}] API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
      console.log(`📝 [${name}] Request data:`, config.data);
      
      // 일반 사용자 토큰 우선 확인
      let token = localStorage.getItem("accessToken");
      
      // 일반 사용자 토큰이 없으면 점주 토큰 확인
      if (!token) {
        token = localStorage.getItem("storeUserAccessToken");
      }
      
      if (token) {
        // 백엔드가 authorization-token 헤더를 기대함 (Bearer 접두사 없이)
        config.headers["authorization-token"] = token;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
};

// 양쪽 인스턴스에 인터셉터 추가
addRequestInterceptor(axiosInstance, 'PROXY');
addRequestInterceptor(fallbackAxiosInstance, 'DIRECT');

// Response Interceptor - 에러 처리 및 토큰 갱신
axiosInstance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<any>>) => {
    console.log(`✅ API Response: ${response.status}`, response.data);
    return response;
  },
  async (error: AxiosError) => {
    console.error('❌ API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method,
      data: error.response?.data,
      message: error.message
    });
    
    const originalRequest = error.config;

    // 401 에러 처리 (토큰 만료)
    if (error.response?.status === 401 && originalRequest) {
      // 토큰 제거 및 로그인 페이지로 리다이렉트
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");

      // 로그인 페이지로 리다이렉트 (나중에 라우터와 연동)
      window.location.href = "/auth/login";

      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// 백엔드 연결 테스트 함수
export const testBackendConnection = async (): Promise<boolean> => {
  try {
    // health 엔드포인트로 연결 테스트
    const response = await axiosInstance.get('/health', { timeout: 5000 });
    
    // 2003 코드는 "인증 토큰 없음"으로 연결은 성공
    if (response.data?.result?.result_code === 2003) {
      console.log('✅ Backend connection successful (auth required):', API_BASE_URL);
      return true;
    }
    
    console.log('✅ Backend connection successful:', API_BASE_URL);
    return true;
  } catch (error: any) {
    // 응답이 있고 2003 코드면 연결 성공 (400 상태코드여도 백엔드 응답이므로 연결됨)
    if (error.response?.data?.result?.result_code === 2003) {
      console.log('✅ Backend connection successful (auth required):', API_BASE_URL);
      return true;
    }
    
    // 400 에러도 백엔드 응답이 있으면 연결 성공
    if (error.response?.status === 400 && error.response?.data?.result) {
      console.log('✅ Backend connection successful (bad request but server responding):', API_BASE_URL);
      return true;
    }
    
    // 401/403도 연결 성공을 의미 (인증만 필요)
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('✅ Backend connection successful (auth required):', API_BASE_URL);
      return true;
    }
    
    console.error('❌ Backend connection failed:', error);
    console.log('Backend URL:', API_BASE_URL);
    return false;
  }
};

// fallback을 시도하는 래퍼 함수
export const axiosWithFallback = {
  async get(url: string, config?: any) {
    try {
      console.log('🎯 Trying primary request...');
      return await axiosInstance.get(url, config);
    } catch (error: any) {
      if ((error.code === 'ERR_NETWORK' || error.message?.includes('CORS') || error.message?.includes('blocked')) && isProduction) {
        console.log('🔄 Network error detected, trying fallback...');
        try {
          return await fallbackAxiosInstance.get(url, config);
        } catch (fallbackError) {
          console.error('❌ Both primary and fallback failed');
          throw fallbackError;
        }
      }
      throw error;
    }
  },
  
  async post(url: string, data?: any, config?: any) {
    try {
      console.log('🎯 Trying primary request...');
      return await axiosInstance.post(url, data, config);
    } catch (error: any) {
      console.log('❌ Primary request failed:', {
        code: error.code,
        message: error.message,
        isProduction,
        willTryFallback: (error.code === 'ERR_NETWORK' || error.message?.includes('CORS') || error.message?.includes('blocked')) && isProduction
      });
      
      if ((error.code === 'ERR_NETWORK' || error.message?.includes('CORS') || error.message?.includes('blocked')) && isProduction) {
        console.log('🔄 Network/CORS error detected, trying fallback...');
        try {
          const fallbackResult = await fallbackAxiosInstance.post(url, data, config);
          console.log('✅ Fallback request succeeded');
          return fallbackResult;
        } catch (fallbackError: any) {
          console.error('❌ Both primary and fallback failed:', fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  }
};

// 앱 시작시 연결 테스트
testBackendConnection();

export { axiosInstance };
export default axiosWithFallback; // fallback 지원 인스턴스를 기본으로 내보내기
