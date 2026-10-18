import { Module } from '@nestjs/common';
import { AddressBookService } from './address-book.service';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { PhotonService } from './photon.service';

@Module({
  controllers: [GeocodingController],
  providers: [PhotonService, AddressBookService, GeocodingService],
  // AddressBookService est exporte : c'est le module missions qui declenche
  // l'alimentation de la base, a chaque arret passe en « livre ».
  exports: [GeocodingService, AddressBookService],
})
export class GeocodingModule {}
