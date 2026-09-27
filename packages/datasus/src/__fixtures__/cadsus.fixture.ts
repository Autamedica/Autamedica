export const cadsusPdqResponseXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v3="urn:hl7-org:v3">
  <soap:Body>
    <v3:PRPA_IN201310UV02>
      <v3:controlActProcess>
        <v3:queryResponse>
          <v3:subjectOf>
            <v3:value xsi:type="II" root="2.16.840.1.113883.4.2.12" extension="123456789012345" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
          </v3:subjectOf>
          <v3:value root="2.16.840.1.113883.4.2.12" extension="98765432100" assigningAuthorityName="CPF"/>
          <v3:name>MARIA DA SILVA</v3:name>
          <v3:name use="MA">JOAQUINA DA SILVA</v3:name>
          <v3:administrativeGenderCode code="F"/>
          <v3:birthTime value="19800101"/>
        </v3:queryResponse>
      </v3:controlActProcess>
    </v3:PRPA_IN201310UV02>
  </soap:Body>
</soap:Envelope>`;

export const cadsusNoResultXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <v3:PRPA_IN201310UV02><v3:queryResponse><v3:code code="QryNoData"/></v3:queryResponse></v3:PRPA_IN201310UV02>
  </soap:Body>
</soap:Envelope>`;