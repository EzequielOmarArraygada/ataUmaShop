import bcrypt from 'bcrypt';
import passport from 'passport';
import { ProductManagerMongo } from './dao/services/managers/ProductManagerMongo.js'; // Importa correctamente

const createHash = password => bcrypt.hashSync(password, bcrypt.genSaltSync(10));
const isValidatePassword = (user, password) => bcrypt.compareSync(password, user.password);
const productManager = new ProductManagerMongo();

const requirePremium = (req, res, next) => {
    // Permitir acceso si el rol es 'premium' o 'admin'
    if (req.session.role !== 'premium' && req.session.role !== 'admin') {
        req.logger.warning(`Acceso denegado: Solo usuarios premium o admin. ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`);
        return res.status(403).send('Acceso denegado: Solo usuarios premium o admin');
    }
    next();
};

const requireOwnershipOrAdmin = async (req, res, next) => {
    const { pid } = req.params;
    const user = req.user;

    try {
        const product = await productManager .getProduct(pid);

        if (!product) {
            req.logger.warning(`Producto no encontrado. ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`);
            return res.status(404).send('Producto no encontrado');
        }

        if (product.owner.toString() !== user._id && user.role !== 'admin') {
            req.logger.warning(`Acceso denegado: No tienes permiso para esta acción. ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`);
            return res.status(403).send('Acceso denegado: No tienes permiso para esta acción');
        }
        next();
    } catch (error) {
        req.logger.error(`Error al verificar el dueño del producto: ${error.message}. ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`);
        res.status(500).send('Error interno del servidor');
    }
};

const passportCall = (strategy, role) => {
    return (req, res, next) => {
        // Permitir acceso sin autenticación explícita a la ruta '/products' y '/products/:id' en métodos GET
        if (req.path.startsWith('/products') && req.method === 'GET') {
            // Intentar autenticar al usuario, pero sin forzar redirección si no está autenticado
            passport.authenticate(strategy, { session: false }, (err, user, info) => {
                if (err) {
                    return next(err);
                }
                // Si el usuario está autenticado, asignarlo a req.user
                if (user) {
                    req.user = user;
                }
                // Continuar con la ruta permitiendo acceso, autenticado o no
                return next();
            })(req, res, next);
        } else {
            // Para el resto de las rutas, aplicar autenticación de forma normal
            passport.authenticate(strategy, function (err, user, info) {
                if (err) {
                    return next(err);
                }
                if (!user) {
                    return res.redirect('/login');
                }

                req.logger.info(
                    `Usuario autenticado: ${user.email}, ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`
                );
                req.logger.debug(
                    `Rol de usuario: ${user.role}. ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`
                );

                if (user.role !== role && user.role !== 'admin') {
                    req.logger.warning(
                        `Acceso denegado. Rol de usuario incorrecto: ${user.role} se requiere: ${role}. ${req.method} en ${req.url} - ${new Date().toLocaleDateString()}`
                    );
                    return res.status(403).send({ error: `Acceso denegado. Rol de usuario incorrecto.` });
                }
                req.user = user;
                next();
            })(req, res, next);
        }
    };
};




export default { createHash, isValidatePassword, passportCall, requirePremium, requireOwnershipOrAdmin };
