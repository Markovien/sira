import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  type AccessTokenPayload,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from '@sira/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';

@ApiTags('authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Cree un compte et son organisation',
    description:
      "Le createur devient administrateur de son organisation. Un livreur independant est une organisation d'une personne.",
  })
  @ApiBody({
    schema: {
      example: {
        phone: '+2250701020304',
        password: 'motdepasse',
        fullName: 'Awa Kone',
        organizationName: 'Livraisons Awa',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Compte cree, jetons emis' })
  @ApiResponse({ status: 409, description: 'Numero deja inscrit' })
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par telephone et mot de passe' })
  @ApiBody({ schema: { example: { phone: '+2250701020304', password: 'motdepasse' } } })
  @ApiResponse({ status: 200, description: 'Jetons emis' })
  @ApiResponse({ status: 401, description: 'Numero ou mot de passe incorrect' })
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Echange un jeton de rafraichissement contre une nouvelle paire',
    description:
      'Le jeton presente est revoque : un jeton vole rejoue apres usage legitime est refuse.',
  })
  @ApiResponse({ status: 200, description: 'Nouvelle paire de jetons' })
  @ApiResponse({ status: 401, description: 'Jeton invalide, expire ou deja utilise' })
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoque tous les jetons de rafraichissement du compte',
    description: 'Deconnecte tous les appareils de l utilisateur.',
  })
  @ApiResponse({ status: 204, description: 'Jetons revoques' })
  async logout(@CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.auth.logout(user.sub);
  }
}
