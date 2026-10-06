export const ACCESS_ROLES=Object.freeze({
 owner:{name:'Administración',description:'Control completo del negocio, carta, reportes, personal y usuarios.'},
 cashier:{name:'Cajera / caja',description:'Caja, pedidos, clientes, disponibilidad y consulta del personal. Sin gestión de accesos.'},
 courier:{name:'Repartidor',description:'Solo sus repartos, rutas y jornada laboral.'},
 worker:{name:'Personal',description:'Solo su asistencia, jornadas y remuneración referencial.'},
});
export const accessSnapshot=row=>Object.fromEntries(['full_name','role','active','hourly_rate'].map(key=>[key,row[key]]));
export function passwordIssue(password, confirmation) {
 if(password.length<10) return 'Usa al menos 10 caracteres.';
 if(password!==confirmation) return 'Las contraseñas no coinciden.';
 return '';
}
export function accessLanding(location) {
 const params=new URLSearchParams(location.hash?.replace(/^#/,''));
 return ['recovery','invite'].includes(params.get('type'));
}
export function authErrorMessage(error) {
 const message=String(error?.message||'');
 if(/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
 if(/email not confirmed/i.test(message)) return 'Confirma tu correo antes de ingresar.';
 if(/same password/i.test(message)) return 'Elige una contraseña distinta a la actual.';
 if(/rate.limit|too many|security purposes/i.test(message)) return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
 if(/expired|invalid.*token|otp/i.test(message)) return 'El enlace venció o ya fue utilizado. Solicita uno nuevo.';
 if(/fetch|network/i.test(message)) return 'No pudimos conectar. Revisa internet y vuelve a intentarlo.';
 return message || 'No se pudo completar la solicitud.';
}
