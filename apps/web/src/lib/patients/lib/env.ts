import { getAppEnv, getLoginUrlBuilder } from '@autamedica/shared';

export const patientsEnv = getAppEnv('patients');
export const patientsLoginUrlBuilder = getLoginUrlBuilder('patients');