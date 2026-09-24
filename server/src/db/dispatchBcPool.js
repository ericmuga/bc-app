import sql from 'mssql';
import 'dotenv/config';
let connecting;
export const dispatchBcTarget=()=>({server:process.env.DISPATCH_BC_HOST||process.env.LEGACY_LIVE_DB_HOST||'172.16.10.8',database:process.env.DISPATCH_BC_DATABASE||process.env.BC_DB_NAME||'FCL'});
export async function getDispatchBcPool(){
 if(!connecting){const target=dispatchBcTarget();connecting=new sql.ConnectionPool({...target,port:Number(process.env.DB_PORT)||1433,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeout:30000,requestTimeout:120000,options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_CERT==='true',enableArithAbort:true},pool:{min:0,max:4,idleTimeoutMillis:30000}}).connect().then(pool=>{pool.on('error',()=>{connecting=null});return pool}).catch(e=>{connecting=null;throw e});}
 return connecting;
}
export async function closeDispatchBcPool(){if(connecting){const pool=await connecting;connecting=null;await pool.close();}}
