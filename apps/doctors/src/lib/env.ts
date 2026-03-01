import { getAppEnv, getLoginUrlBuilder } from '@autamedica/shared';

export const doctorsEnv = getAppEnv('doctors');
export const loginUrlBuilder = getLoginUrlBuilder('doctors');